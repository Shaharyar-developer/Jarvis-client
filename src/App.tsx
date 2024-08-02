import { motion } from "framer-motion";
import Meyda from "meyda";
import { useEffect, useRef, useState } from "react";
import Bumblebee from "bumblebee-hotword";

const bumblebee = new Bumblebee();

function App() {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [timeStartedSpeaking, setTimeStartedSpeaking] = useState<number>(0);
  const [isSending, setIsSending] = useState(false);
  const [text, setText] = useState<string>("");

  const timeStartedSpeakingRef = useRef(timeStartedSpeaking);
  const chunksRef = useRef<Blob[]>([]);
  const audioUrlRef = useRef<string | null>(null);

  useEffect(() => {
    timeStartedSpeakingRef.current = timeStartedSpeaking;
  }, [timeStartedSpeaking]);

  useEffect(() => {
    bumblebee.setWorkersPath("/bumblebee-workers");
    bumblebee.addHotword("jarvis");
    bumblebee.setSensitivity(0.8);
    bumblebee.start();

    navigator.mediaDevices
      .getUserMedia({ audio: true })
      .then((stream) => {
        const mediaRecorder = new MediaRecorder(stream);
        let isRecording = false;

        const handleHotword = () => {
          setIsSpeaking(true);
          setTimeStartedSpeaking(Date.now());
          if (!isRecording) {
            mediaRecorder.start();
            isRecording = true;
          }
        };

        bumblebee.on("hotword", handleHotword);

        mediaRecorder.ondataavailable = (event) => {
          chunksRef.current.push(event.data);
        };

        mediaRecorder.onstop = () => {
          const blob = new Blob(chunksRef.current, {
            type: "audio/ogg; codecs=opus",
          });
          sendBlob(blob); // Send the blob
          chunksRef.current = [];

          setTimeout(() => {
            if (audioUrlRef.current) {
              URL.revokeObjectURL(audioUrlRef.current);
              audioUrlRef.current = null;
            }
          }, 5000);
        };

        const audioContext = new AudioContext();
        const source = audioContext.createMediaStreamSource(stream);
        const analyzer = Meyda.createMeydaAnalyzer({
          audioContext,
          source,
          bufferSize: 512,
          featureExtractors: ["rms", "energy"],
          callback: (features: any) => {
            if (Date.now() - timeStartedSpeakingRef.current > 2000) {
              if (isRecording) {
                mediaRecorder.stop();
                isRecording = false;
                setIsSpeaking(false);
              }
            }
            if (features.energy > 0.1) {
              setTimeStartedSpeaking(Date.now());
            }
          },
        });
        analyzer.start();

        return () => {
          bumblebee.off("hotword", handleHotword);
          analyzer.stop();
          audioContext.close();
        };
      })
      .catch((error) => {
        console.error("Error accessing audio:", error);
      });
  }, []);

  async function sendBlob(blob: Blob) {
    if (isSending) {
      console.log("Previous request is still in progress.");
      return; // Prevent new requests if one is already in progress
    }

    setIsSending(true); // Set the flag to indicate that a request is in progress

    const reader = new FileReader();

    reader.onloadend = async () => {
      console.log("File read completed");
      const base64String = reader.result as string;
      const base64Data = base64String.split(",")[1];

      try {
        const response = await fetch("http://localhost:4000/new", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            base64Data,
            contentType: blob.type,
          }),
        });

        if (!response.ok) {
          throw new Error(`HTTP error! Status: ${response.status}`);
        }
        const reader = response.body?.getReader();
        const decoder = new TextDecoder();
        if (!reader) {
          throw new Error("Failed to get reader");
        }
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            break;
          }
          const text = decoder.decode(value);
          setText((prev) => prev + text);
        }

        setIsSending(false);
      } catch (error) {
        console.error("Failed to fetch:", error);
        setIsSending(false);
      }
    };

    reader.readAsDataURL(blob);
  }

  return (
    <>
      <motion.div
        initial={{ height: 100, width: 100 }}
        animate={{
          height: isSpeaking ? 300 : 100,
          width: isSpeaking ? 300 : 100,
        }}
        transition={{ type: "spring" }}
        className="bg-neutral-200 rounded-full fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
      />
      <p>{text}</p>
    </>
  );
}

export default App;
