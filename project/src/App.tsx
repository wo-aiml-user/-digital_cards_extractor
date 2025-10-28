import { useState, useEffect } from 'react';
import { Upload, Loader2, CheckCircle, AlertCircle, X, Trash2 } from 'lucide-react';
import { GoogleGenerativeAI } from '@google/generative-ai';

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

interface ProcessedCard {
  id: string;
  previewUrl: string;
  data: CardData;
  timestamp: string;
}

interface User {
  userId: string;
  email: string;
  name: string;
  picture: string;
}

// Initialize Gemini AI
const genAI = new GoogleGenerativeAI(import.meta.env.VITE_GOOGLE_API_KEY || '');

function App() {
  const [isProcessing, setIsProcessing] = useState(false);
  const [processedCards, setProcessedCards] = useState<ProcessedCard[]>([]);
  const [error, setError] = useState<string>('');
  const [success, setSuccess] = useState<string>('');
  const [processingProgress, setProcessingProgress] = useState<{current: number, total: number} | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [showSignInModal, setShowSignInModal] = useState(false);

  // Check if user is authenticated on component mount
  useEffect(() => {
    checkAuth();

    // Listen for auth success message from OAuth popup
    const handleMessage = (event: MessageEvent) => {
      if (event.data === 'auth_success') {
        checkAuth();
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  // API base URL - use local server in development  
  const API_BASE_URL = import.meta.env.DEV ? 'http://localhost:3001' : '';

  const checkAuth = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/user`, {
        credentials: 'include'
      });

      if (response.ok) {
        const userData = await response.json();
        setUser(userData);
        setShowSignInModal(false);
      } else {
        // Show sign-in UI if not authenticated
        setShowSignInModal(true);
      }
    } catch (err) {
      console.error('Error checking auth:', err);
      setShowSignInModal(true);
    }
  };

  const handleGoogleSignIn = () => {
    // Open Google OAuth in new window
    const width = 600;
    const height = 700;
    const left = (window.innerWidth - width) / 2;
    const top = (window.innerHeight - height) / 2;

    const popup = window.open(
      `${API_BASE_URL}/api/auth/google`,
      'google-auth',
      `width=${width},height=${height},left=${left},top=${top}`
    );

    // Listen for the popup to close or redirect
    const checkClosed = setInterval(() => {
      if (popup?.closed) {
        clearInterval(checkClosed);
        // Check auth status after popup closes
        setTimeout(() => {
          checkAuth();
        }, 1000);
      }
    }, 1000);
  };

  const processImage = async (file: File): Promise<{ previewUrl: string; data: CardData }> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = async () => {
        const previewUrl = reader.result as string;
        const base64String = previewUrl.split(',')[1];

        try {
          const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

          const prompt = `You are an expert OCR and data extraction assistant.
Extract all relevant information from this business card image and return as JSON with keys:
{
  "name": "",
  "company": "",
  "job_title": "",
  "email": "",
  "phone": "",
  "website": "",
  "address": "",
  "social_links": []
}
If a field is missing, leave it blank.`;

          const result = await model.generateContent([
            {
              inlineData: {
                data: base64String,
                mimeType: file.type,
              },
            },
            prompt,
          ]);

          const response = await result.response;
          const text = response.text();

          // Extract JSON from response (handles both plain JSON and markdown code blocks)
          let jsonString = text;
          
          // Remove markdown code blocks if present
          const codeBlockMatch = text.match(/```json\s*([\s\S]*?)\s*```/);
          if (codeBlockMatch) {
            jsonString = codeBlockMatch[1];
          }
          
          // Extract JSON object
          const jsonMatch = jsonString.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const cardData = JSON.parse(jsonMatch[0]);
            resolve({ previewUrl, data: cardData });
          } else {
            throw new Error('Failed to extract valid JSON from response');
          }
        } catch (err) {
          reject(err);
        }
      };
      reader.readAsDataURL(file);
    });
  };

  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    // Enforce authentication
    if (!user) {
      setError('Please sign in to upload and process images');
      setShowSignInModal(true);
      handleGoogleSignIn();
      // Reset input
      if (event.target) event.target.value = '';
      return;
    }

    const files = event.target.files;
    if (!files || files.length === 0) return;

    const validFiles = Array.from(files).filter(file => file.type.startsWith('image/'));

    if (validFiles.length === 0) {
      setError('Please upload valid image files');
      return;
    }

    setError('');
    setSuccess('');
    setIsProcessing(true);
    setProcessingProgress({ current: 0, total: validFiles.length });

    const newProcessedCards: ProcessedCard[] = [];

    for (let i = 0; i < validFiles.length; i++) {
      try {
        setProcessingProgress({ current: i + 1, total: validFiles.length });
        const result = await processImage(validFiles[i]);

        const card: ProcessedCard = {
          id: `${Date.now()}-${i}`,
          previewUrl: result.previewUrl,
          data: result.data,
          timestamp: new Date().toISOString(),
        };

        newProcessedCards.push(card);
      } catch (err) {
        console.error(`Failed to process image ${i + 1}:`, err);
      }
    }

    setProcessedCards(prev => [...prev, ...newProcessedCards]);

    const sessionData = JSON.parse(localStorage.getItem('cardSessions') || '[]');
    sessionData.push(...newProcessedCards);
    localStorage.setItem('cardSessions', JSON.stringify(sessionData));

    setIsProcessing(false);
    setProcessingProgress(null);
    event.target.value = '';
  };

  const handleRemoveCard = (id: string) => {
    setProcessedCards(prev => prev.filter(card => card.id !== id));

    const sessionData = JSON.parse(localStorage.getItem('cardSessions') || '[]');
    const updatedData = sessionData.filter((card: ProcessedCard) => card.id !== id);
    localStorage.setItem('cardSessions', JSON.stringify(updatedData));
  };

  const handleExportToSheets = async () => {
    if (processedCards.length === 0) return;

    if (!user) {
      setError('Please sign in to save to Google Sheets');
      setShowSignInModal(true);
      return;
    }

    setError('');
    setSuccess('');

    try {
      // Use API base URL for development
      const apiUrl = `${API_BASE_URL}/api/save-to-sheets`;
      
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ cards: processedCards }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to save to Google Sheets');
      }

      setSuccess(result.message || `Successfully saved ${processedCards.length} card${processedCards.length > 1 ? 's' : ''} to Google Sheets`);
    } catch (err) {
      console.error('Error saving to Google Sheets:', err);
      setError(err instanceof Error ? err.message : 'Failed to save to Google Sheets');
    }
  };

  const handleClearAll = () => {
    setProcessedCards([]);
    setError('');
    setSuccess('');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      {/* Sign In Button - Top Right Corner (always visible when not authenticated) */}
      {!user && (
        <div className="fixed top-4 right-4 z-50">
          <button
            onClick={handleGoogleSignIn}
            className="bg-white border-2 border-slate-300 rounded-lg px-4 py-2 shadow-lg hover:bg-slate-50 transition-colors font-medium text-slate-700 flex items-center gap-2"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            <span>Sign in with Google</span>
          </button>
        </div>
      )}

      <div className="container mx-auto px-4 py-12">
        <div className="max-w-6xl mx-auto">
          {/* Header with User Info */}
          <div className="flex items-center justify-between mb-8">
            <div className="text-center flex-1">
              <h1 className="text-4xl font-bold text-slate-800 mb-3">
                Business Card Scanner
              </h1>
              <p className="text-slate-600">
                Upload single or multiple business card images to automatically extract contact information
              </p>
            </div>
            
            {user && (
              <div className="flex items-center gap-3 ml-4">
                <div className="flex items-center gap-3 bg-white rounded-lg px-4 py-2 shadow-md">
                  {user.picture && (
                    <img src={user.picture} alt={user.name} className="w-10 h-10 rounded-full" />
                  )}
                  <div>
                    <p className="text-sm font-medium text-slate-800">{user.name}</p>
                    <p className="text-xs text-slate-500">{user.email}</p>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="bg-white rounded-2xl shadow-xl p-8 mb-6">
            <div className="mb-8">
              <label
                htmlFor="file-upload"
                onClick={(e) => {
                  if (!user) {
                    e.preventDefault();
                    handleGoogleSignIn();
                  }
                }}
                className={`relative flex flex-col items-center justify-center w-full h-64 border-3 border-dashed rounded-xl cursor-pointer transition-all duration-200 ${!user ? 'border-slate-200 bg-slate-100 cursor-not-allowed' : 'border-slate-300 bg-slate-50 hover:bg-slate-100'}`}
              >
                {!user && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-6">
                    <p className="text-slate-600 mb-2">Please sign in to upload images</p>
                    <button
                      type="button"
                      onClick={(e) => { e.preventDefault(); handleGoogleSignIn(); }}
                      className="bg-white border-2 border-slate-300 rounded-lg px-4 py-2 shadow hover:bg-slate-50 font-medium text-slate-700 flex items-center gap-2"
                    >
                      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                      </svg>
                      <span>Sign in with Google</span>
                    </button>
                  </div>
                )}

                <div className="flex flex-col items-center justify-center pt-5 pb-6">
                  <Upload className="w-12 h-12 text-slate-400 mb-4" />
                  <p className="mb-2 text-sm text-slate-600">
                    <span className="font-semibold">Click to upload</span> or drag and drop
                  </p>
                  <p className="text-xs text-slate-500">PNG, JPG, JPEG (Single or Multiple)</p>
                </div>
                <input
                  id="file-upload"
                  type="file"
                  className="hidden"
                  accept="image/*"
                  onChange={handleImageUpload}
                  disabled={isProcessing || !user}
                  multiple
                />
              </label>
            </div>

            {isProcessing && processingProgress && (
              <div className="flex flex-col items-center justify-center py-8">
                <Loader2 className="w-8 h-8 text-blue-600 animate-spin mr-3 mb-3" />
                <span className="text-slate-600">
                  Processing image {processingProgress.current} of {processingProgress.total}...
                </span>
              </div>
            )}

            {error && (
              <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-lg mb-6">
                <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                <p className="text-red-700 text-sm">{error}</p>
              </div>
            )}

            {success && (
              <div className="flex items-start gap-3 p-4 bg-green-50 border border-green-200 rounded-lg mb-6">
                <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                <p className="text-green-700 text-sm">{success}</p>
              </div>
            )}

            {processedCards.length > 0 && (
              <div className="space-y-6">
                <div className="flex items-center justify-between border-b border-slate-200 pb-4">
                  <h3 className="text-xl font-semibold text-slate-800">
                    Extracted Cards ({processedCards.length})
                  </h3>
                  <button
                    onClick={handleClearAll}
                    className="flex items-center gap-2 text-red-600 hover:text-red-700 text-sm font-medium transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                    Clear All
                  </button>
                </div>

                <div className="space-y-6 max-h-[600px] overflow-y-auto pr-2">
                  {processedCards.map((card) => (
                    <div key={card.id} className="border border-slate-200 rounded-xl p-6 bg-slate-50 relative">
                      <button
                        onClick={() => handleRemoveCard(card.id)}
                        className="absolute top-4 right-4 p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      >
                        <X className="w-5 h-5" />
                      </button>

                      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        <div className="lg:col-span-1">
                          <div className="rounded-lg overflow-hidden border border-slate-300 bg-white">
                            <img
                              src={card.previewUrl}
                              alt="Business card"
                              className="w-full h-auto object-contain"
                            />
                          </div>
                        </div>

                        <div className="lg:col-span-2">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {card.data.name && (
                              <div className="p-3 bg-white rounded-lg border border-slate-200">
                                <p className="text-xs font-medium text-slate-500 uppercase mb-1">Name</p>
                                <p className="text-slate-800 text-sm">{card.data.name}</p>
                              </div>
                            )}
                            {card.data.company && (
                              <div className="p-3 bg-white rounded-lg border border-slate-200">
                                <p className="text-xs font-medium text-slate-500 uppercase mb-1">Company</p>
                                <p className="text-slate-800 text-sm">{card.data.company}</p>
                              </div>
                            )}
                            {card.data.job_title && (
                              <div className="p-3 bg-white rounded-lg border border-slate-200">
                                <p className="text-xs font-medium text-slate-500 uppercase mb-1">Job Title</p>
                                <p className="text-slate-800 text-sm">{card.data.job_title}</p>
                              </div>
                            )}
                            {card.data.email && (
                              <div className="p-3 bg-white rounded-lg border border-slate-200">
                                <p className="text-xs font-medium text-slate-500 uppercase mb-1">Email</p>
                                <p className="text-slate-800 text-sm break-all">{card.data.email}</p>
                              </div>
                            )}
                            {card.data.phone && (
                              <div className="p-3 bg-white rounded-lg border border-slate-200">
                                <p className="text-xs font-medium text-slate-500 uppercase mb-1">Phone</p>
                                <p className="text-slate-800 text-sm">{card.data.phone}</p>
                              </div>
                            )}
                            {card.data.website && (
                              <div className="p-3 bg-white rounded-lg border border-slate-200">
                                <p className="text-xs font-medium text-slate-500 uppercase mb-1">Website</p>
                                <p className="text-slate-800 text-sm break-all">{card.data.website}</p>
                              </div>
                            )}
                            {card.data.address && (
                              <div className="p-3 bg-white rounded-lg border border-slate-200 md:col-span-2">
                                <p className="text-xs font-medium text-slate-500 uppercase mb-1">Address</p>
                                <p className="text-slate-800 text-sm">{card.data.address}</p>
                              </div>
                            )}
                            {card.data.social_links && card.data.social_links.length > 0 && (
                              <div className="p-3 bg-white rounded-lg border border-slate-200 md:col-span-2">
                                <p className="text-xs font-medium text-slate-500 uppercase mb-1">Social Links</p>
                                <p className="text-slate-800 text-sm break-all">{card.data.social_links.join(', ')}</p>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <button
                  onClick={handleExportToSheets}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-6 rounded-lg transition-colors duration-200 flex items-center justify-center gap-2"
                >
                  Save to Google Sheets ({processedCards.length})
                </button>
              </div>
            )}
          </div>

          <div className="text-center text-sm text-slate-500">
            <p>All extracted data is stored in your browser session</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
