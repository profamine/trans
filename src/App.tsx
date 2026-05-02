import { useState, useRef, useEffect } from 'react';
import { Mic, Square, Loader2, Copy, Check, Info } from 'lucide-react';
import { motion } from 'motion/react';
import { GoogleGenAI } from '@google/genai';

// Initialize the Gemini API client
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export default function App() {
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [duration, setDuration] = useState(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);

  // Handle the recording timer
  useEffect(() => {
    if (isRecording) {
      timerRef.current = window.setInterval(() => {
        setDuration(prev => prev + 1);
      }, 1000);
    } else {
      if (timerRef.current) window.clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
    };
  }, [isRecording]);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const startRecording = async () => {
    try {
      setError('');
      setTranscript('');
      setDuration(0);

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });

      // Laisse le navigateur web mobile choisir le format encodeur le mieux supporté (ex: webm sur Android)
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        const mimeType = recorder.mimeType || 'audio/webm';
        const blob = new Blob(chunksRef.current, { type: mimeType });
        processAudio(blob, mimeType);
        stream.getTracks().forEach(track => track.stop());
      };

      recorder.start();
      setIsRecording(true);
    } catch (err: any) {
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setError("Accès refusé au microphone. Sur Android, assurez-vous de l'autoriser dans les paramètres de votre navigateur.");
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        setError("Aucun microphone n'a été détecté sur votre appareil.");
      } else {
        setError("Impossible d'accéder au microphone. Essayez d'utiliser le navigateur par défaut (ex: Chrome sur Android).");
      }
      console.error("Microphone Access Error:", err);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const processAudio = (blob: Blob, mimeType: string) => {
    setIsProcessing(true);
    const reader = new FileReader();
    reader.readAsDataURL(blob);
    reader.onloadend = async () => {
      try {
        const base64data = (reader.result as string).split(',')[1];
        const finalMimeType = mimeType.split(';')[0] || 'audio/webm';

        const response = await ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: [{
            role: 'user',
            parts: [
              {
                inlineData: {
                  data: base64data,
                  mimeType: finalMimeType
                }
              },
              { text: 'Transcris et traduis si besoin cet audio exactement en arabe. Retranscris fidèlement l\'intention en arabe classique ou moderne. Fournis uniquement le texte arabe absolu, sans aucun autre commentaire, sans markdown, sans guillemets.' }
            ]
          }]
        });

        setTranscript(response.text || "Aucune transcription trouvée.");
      } catch (err: any) {
        setError(`Erreur lors de la transcription avec Gemini AI: ${err.message || 'Erreur inconnue'}`);
        console.error(err);
      } finally {
        setIsProcessing(false);
      }
    };
  };

  const copyToClipboard = async () => {
    if (!transcript) return;
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(transcript);
      } else {
        // Fallback pour certains navigateurs Android webviews
        const textArea = document.createElement("textarea");
        textArea.value = transcript;
        textArea.style.position = "fixed";
        textArea.style.top = "0";
        textArea.style.left = "0";
        textArea.style.opacity = "0";
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy', err);
      setError("Impossible de copier automatiquement dans le presse-papier.");
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center py-12 px-4 sm:px-6 lg:px-8 font-sans">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-2xl bg-white rounded-2xl shadow-xl overflow-hidden border border-gray-100"
      >
        <div className="p-8 text-center bg-blue-600">
          <h1 className="text-3xl font-bold text-white mb-2">Dictée Vocale Arabe</h1>
          <p className="text-blue-100">Enregistrez votre voix pour obtenir une transcription instantanée en arabe</p>
        </div>

        <div className="p-8">
          {error && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="mb-6 p-4 bg-red-50 text-red-700 rounded-lg flex items-start gap-3 text-sm"
            >
              <Info className="w-5 h-5 flex-shrink-0 mt-0.5" />
              <p>{error}</p>
            </motion.div>
          )}

          <div className="flex flex-col items-center justify-center py-8">
            <motion.button
              whileHover={!isProcessing ? { scale: 1.05 } : {}}
              whileTap={!isProcessing ? { scale: 0.95 } : {}}
              onClick={isRecording ? stopRecording : startRecording}
              disabled={isProcessing}
              className={`relative flex items-center justify-center w-28 h-28 rounded-full shadow-lg transition-colors focus:outline-none focus:ring-4 focus:ring-offset-2 ${
                isRecording
                  ? 'bg-red-500 hover:bg-red-600 focus:ring-red-500'
                  : 'bg-blue-600 hover:bg-blue-700 focus:ring-blue-600'
              } ${(isProcessing) && 'opacity-70 cursor-wait'}`}
            >
              {isRecording && (
                <span className="absolute inset-0 rounded-full animate-ping bg-red-400 opacity-60"></span>
              )}
              {isRecording ? (
                <Square className="w-12 h-12 text-white fill-current" />
              ) : isProcessing ? (
                <Loader2 className="w-12 h-12 text-white animate-spin" />
              ) : (
                <Mic className="w-12 h-12 text-white" />
              )}
            </motion.button>

            <div className="mt-6 text-center h-8">
              {isRecording ? (
                <span className="text-lg font-medium text-red-600 flex items-center justify-center gap-2">
                  <span className="w-2.5 h-2.5 bg-red-600 rounded-full animate-pulse"></span>
                  Enregistrement en cours... {formatTime(duration)}
                </span>
              ) : isProcessing ? (
                <span className="text-lg font-medium text-blue-600 flex items-center justify-center gap-2">
                  <Loader2 className="w-5 h-5 animate-spin" /> Traitement par l'IA...
                </span>
              ) : (
                <span className="text-lg font-medium text-gray-500">
                  Appuyez sur le micro pour parler
                </span>
              )}
            </div>
          </div>

          {/* Transcript Result */}
          <div className="mt-8">
            <div className="flex items-center justify-between mb-3 rounded-lg px-1">
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Texte traduit / transcrit</h2>
              <button
                onClick={copyToClipboard}
                disabled={!transcript || isProcessing}
                className="flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:text-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {copied ? (
                  <><Check className="w-4 h-4" /> Copié</>
                ) : (
                  <><Copy className="w-4 h-4" /> Copier</>
                )}
              </button>
            </div>
            
            <div
              className={`w-full min-h-[160px] p-6 bg-gray-50 border border-gray-200 rounded-xl flex items-start text-right transition-all duration-300 ${isProcessing && 'opacity-50 blur-[2px]'}`}
              dir="rtl"
            >
              {transcript ? (
                <p className="text-2xl font-arabic text-gray-900 leading-relaxed w-full">
                  {transcript}
                </p>
              ) : (
                <div className="text-lg text-gray-400 font-arabic text-center w-full my-auto self-center select-none opacity-60">
                  سيظهر النص العربي هنا...
                  <br/>
                  <span className="text-sm font-sans mt-2 block opacity-75" dir="ltr">(Le texte apparaîtra ici)</span>
                </div>
              )}
            </div>
          </div>
        </div>
        
        <div className="bg-gray-100 p-4 text-center text-xs text-gray-500 border-t border-gray-200">
          Assurez-vous d'avoir autorisé l'accès au microphone dans votre navigateur. Les données sont traitées via Google Gemini.
        </div>
      </motion.div>
    </div>
  );
}
