# Business Card Scanner

Extract contact information from business cards using AI.

## Features

- **AI-Powered Extraction**: Uses Google Gemini AI directly in the browser to extract contact information
- **Batch Processing**: Upload and process multiple business cards at once
- **CSV Export**: Export all extracted data to CSV format
- **Local Storage**: All extracted cards are stored in browser's localStorage for persistence
- **Modern UI**: Clean, responsive interface built with React and TailwindCSS
- **No Backend Required**: Everything runs in the browser

## Architecture

This is a single-page application (SPA) built with React + TypeScript + Vite that calls Google APIs directly from the browser.

## Prerequisites

- Node.js (v18 or higher)
- A Google API key (Gemini) - [Get one here](https://makersuite.google.com/app/apikey)

## Installation

1. Install dependencies:
   ```bash
   npm install
   ```

2. Create a `.env` file in the project root:
   ```bash
   cp .env.example .env
   ```

3. Add your Google API key to the `.env` file:
   ```
   VITE_GOOGLE_API_KEY=your_google_api_key_here
   ```

4. Start the development server:
   ```bash
   npm run dev
   ```

5. Open your browser to the URL shown in the terminal (typically `http://localhost:5173`)

## Usage

1. **Upload Business Cards**: Click the upload area or drag and drop business card images (single or multiple)
2. **View Extracted Data**: The AI will extract contact information and display it in cards
3. **Review Data**: Check the extracted information for accuracy
4. **Export to CSV**: Click "Export to CSV" to download all extracted cards as a CSV file
5. **Persistent Storage**: All extracted cards are automatically saved to your browser's localStorage

## Project Structure

```
card_exrector/
├── project/
│   ├── src/                   # Frontend source
│   │   ├── App.tsx            # Main React component
│   │   ├── components/        # React components
│   │   └── types/             # TypeScript types
│   ├── .env                   # Environment variables
│   └── package.json           # Dependencies
```

## Technologies Used

- React 18
- TypeScript
- Vite
- TailwindCSS
- Lucide React (icons)
- Google Generative AI (Gemini)

## Security Notes

- **Never commit `.env` files** with real API keys to version control (it's in `.gitignore`)
- Keep your Google API key secure
- API keys are exposed in the browser - only use API keys with appropriate restrictions

## Troubleshooting

### "Failed to extract card information"
- Verify your `VITE_GOOGLE_API_KEY` is correct in `.env`
- Check that the image is a valid format (JPG, PNG, etc.)
- Ensure your API key has Gemini API access enabled
- Check browser console for detailed error messages

## License

MIT
