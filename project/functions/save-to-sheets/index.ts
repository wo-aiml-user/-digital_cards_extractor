import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface CardData {
  name: string;
  company: string;
  job_title: string;
  email: string;
  phone: string;
  website: string;
  address: string;
  social_links: string[];
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const payload = await req.json();
    const cards = (payload?.cards as CardData[] | undefined) || undefined;
    const cardData = (payload?.cardData as CardData | undefined) || undefined;

    if ((!cards || cards.length === 0) && !cardData) {
      return new Response(
        JSON.stringify({ error: "Card data is required" }),
        {
          status: 400,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    const SHEET_ID = Deno.env.get("GOOGLE_SHEET_ID");
    const SERVICE_ACCOUNT_EMAIL = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_EMAIL");
    const PRIVATE_KEY = Deno.env.get("GOOGLE_PRIVATE_KEY")?.replace(/\\n/g, "\n");

    if (!SHEET_ID || !SERVICE_ACCOUNT_EMAIL || !PRIVATE_KEY) {
      return new Response(
        JSON.stringify({ error: "Google Sheets credentials not configured" }),
        {
          status: 500,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    const jwtHeader = btoa(JSON.stringify({ alg: "RS256", typ: "JWT" }));
    const now = Math.floor(Date.now() / 1000);
    const jwtClaimSet = btoa(
      JSON.stringify({
        iss: SERVICE_ACCOUNT_EMAIL,
        scope: "https://www.googleapis.com/auth/spreadsheets",
        aud: "https://oauth2.googleapis.com/token",
        exp: now + 3600,
        iat: now,
      })
    );

    const unsignedJwt = `${jwtHeader}.${jwtClaimSet}`;

    const encoder = new TextEncoder();
    const data = encoder.encode(unsignedJwt);
    const privateKeyData = PRIVATE_KEY.replace(
      /-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----/g,
      ""
    )
      .replace(/\s/g, "");

    const binaryKey = Uint8Array.from(atob(privateKeyData), (c) =>
      c.charCodeAt(0)
    );

    const cryptoKey = await crypto.subtle.importKey(
      "pkcs8",
      binaryKey,
      {
        name: "RSASSA-PKCS1-v1_5",
        hash: "SHA-256",
      },
      false,
      ["sign"]
    );

    const signature = await crypto.subtle.sign(
      "RSASSA-PKCS1-v1_5",
      cryptoKey,
      data
    );

    const signatureBase64 = btoa(
      String.fromCharCode(...new Uint8Array(signature))
    )
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=/g, "");

    const jwt = `${unsignedJwt}.${signatureBase64}`;

    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error("Token error:", errorText);
      return new Response(
        JSON.stringify({ error: "Failed to authenticate with Google" }),
        {
          status: 500,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    const { access_token } = await tokenResponse.json();

    const inputList: CardData[] = cards && cards.length > 0 ? cards : [cardData as CardData];
    const rows = inputList.map((d) => [
      d?.name || "",
      d?.company || "",
      d?.job_title || "",
      d?.email || "",
      d?.phone || "",
      d?.website || "",
      d?.address || "",
      Array.isArray(d?.social_links) ? d.social_links.join(", ") : "",
      new Date().toISOString(),
    ]);

    const appendResponse = await fetch(
  `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/cards_details!A1:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
  {
    method: "POST",
    headers: {
      Authorization: `Bearer ${access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      majorDimension: "ROWS", // <-- ensures vertical orientation
      values: rows,           // each inner array becomes a new row
    }),
  }
);


    if (!appendResponse.ok) {
      const errorText = await appendResponse.text();
      console.error("Sheets API error:", errorText);
      return new Response(
        JSON.stringify({ error: "Failed to save to Google Sheets" }),
        {
          status: 500,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    return new Response(
      JSON.stringify({ success: true, message: `${rows.length} row${rows.length > 1 ? 's' : ''} saved to Google Sheets successfully` }),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (error) {
    console.error("Error in save-to-sheets:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  }
});