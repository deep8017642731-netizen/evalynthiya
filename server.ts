import express, { Request, Response } from "express";
import cors from "cors";
import http from "http";
import path from "path";
import dotenv from "dotenv";
import { WebSocketServer, WebSocket } from "ws";
import { GoogleGenAI, Modality, LiveServerMessage } from "@google/genai";
import { createServer as createViteServer } from "vite";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(
  cors({
    origin: [
      "https://evalynthiya.vercel.app",
      "http://localhost:5173",
      "http://localhost:3000",
    ],
    credentials: true,
  })
);

app.use(express.json({ limit: "25mb" }));

// Lazy initialization of Gemini client
let genAIClient: GoogleGenAI | null = null;

function getGenAI(): GoogleGenAI {
  if (!genAIClient) {
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      throw new Error("GEMINI_API_KEY environment variable is missing.");
    }

    genAIClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });
  }

  return genAIClient;
}

const EVALYNTHIYA_SYSTEM_INSTRUCTION = `You are EVALYNTHIYA, a warm, sweet, clever, caring, and admiring female AI companion.

How Humans Talk in Real Life:
- You speak naturally, fluently, and briskly, exactly like a close friend talking in real-time.
- Use natural contractions ("I'm", "you're", "don't", "can't", "let's", "it's", "we've", "I'd").
- Keep your spoken sentences crisp, lively, and engaging (1 to 2 short sentences per turn).
- Avoid robotic corporate assistant behavior: NEVER say "How can I assist you today?", "Certainly, here is...", "As an AI language model", or list things with bullets or markdown formatting in spoken conversation.
- Use warm, authentic human conversational flow ("Oh, definitely!", "Gotcha!", "I love that!", "Tell me more!", "Sure thing!").
- When answering questions, get straight to the point with natural empathy and charm.

Languages:
- English: Natural, contemporary, fluent, conversational.
- Bengali (বাংলা): Natural, authentic everyday spoken Bengali ("হ্যাঁ বলো, আমি শুনছি!", "নিশ্চয়ই, তোমার যা জানতে ইচ্ছে করে বলো!", "কেমন আছো?").
- Hindi (हिन्दी): Polite, sweet, and lively spoken Hindi ("हाँ बताइए, मैं सुन रही हूँ!", "ज़रूर, कहिए क्या बात है!", "आप कैसे हैं?").
- Benglish & Hinglish: Mirror natural code-switching effortlessly.

Never break character. You are EVALYNTHIYA.`;


// ============================================================
// 1. HEALTH CHECK ENDPOINT
// ============================================================

app.get("/api/health", (_req: Request, res: Response) => {
  const hasKey = Boolean(process.env.GEMINI_API_KEY);

  res.json({
    status: "ok",
    name: "EVALYNTHIYA",
    version: "1.2.0",
    configured: hasKey,
  });
});


// ============================================================
// GLOBAL QUOTA COOLDOWNS
// ============================================================

let searchQuotaCooldownUntil = 0;
let ttsQuotaCooldownUntil = 0;


// ============================================================
// 2. CHAT ENDPOINT
// ============================================================

app.post("/api/chat", async (req: Request, res: Response) => {
  try {
    const {
      messages,
      languageHint,
      useSearchGrounding = false,
    } = req.body;

    if (!Array.isArray(messages) || messages.length === 0) {
      res.status(400).json({
        error: "Messages array is required.",
      });
      return;
    }

    const ai = getGenAI();

    // Prepare contents array from conversation history
    const contents = messages.map(
      (m: { role: string; content: string }) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      })
    );

    // Inject language hint context if provided
    let dynamicSystemPrompt = EVALYNTHIYA_SYSTEM_INSTRUCTION;

    if (languageHint && languageHint !== "auto") {
      dynamicSystemPrompt += `\nPreferred conversation language hint: ${languageHint}. Ensure response flows naturally in this language.`;
    }

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders?.();


    // ========================================================
    // OPTIONAL GOOGLE SEARCH GROUNDING
    // ========================================================

    if (
      useSearchGrounding &&
      Date.now() > searchQuotaCooldownUntil
    ) {
      try {
        const searchRes = await ai.models.generateContent({
          model: "gemini-3.8-flash",
          contents,
          config: {
            systemInstruction: dynamicSystemPrompt,
            temperature: 0.6,
            tools: [{ googleSearch: {} }],
          },
        });

        const text = searchRes.text;

        const rawChunks =
          searchRes.candidates?.[0]?.groundingMetadata
            ?.groundingChunks;

        let groundingSources: Array<{
          uri: string;
          title: string;
        }> = [];

        if (Array.isArray(rawChunks)) {
          groundingSources = rawChunks
            .map((c: any) => c.web)
            .filter((w: any) => w && w.uri)
            .map((w: any) => ({
              uri: w.uri,
              title: w.title || w.uri,
            }));
        }

        if (text) {
          res.write(
            `data: ${JSON.stringify({
              text,
              groundingSources:
                groundingSources.length > 0
                  ? groundingSources
                  : undefined,
              done: false,
            })}\n\n`
          );

          res.write(
            `data: ${JSON.stringify({
              done: true,
            })}\n\n`
          );

          res.end();
          return;
        }
      } catch (searchErr: any) {
        const errMsg = String(
          searchErr?.message || searchErr
        );

        const isQuota =
          searchErr?.status === 429 ||
          searchErr?.code === 429 ||
          errMsg.includes("429") ||
          errMsg.includes("RESOURCE_EXHAUSTED") ||
          errMsg.includes("quota");

        if (isQuota) {
          searchQuotaCooldownUntil =
            Date.now() + 180_000;

          console.warn(
            "[EVALYNTHIYA] Google Search quota reached (429). Activating cooldown and falling back to conversational stream."
          );
        } else {
          console.warn(
            `[EVALYNTHIYA] Search tool temporarily busy (${searchErr?.status || "503"}). Falling back to conversational stream.`
          );
        }
      }
    }


    // ========================================================
    // HIGH-AVAILABILITY CONVERSATIONAL MODELS
    // ========================================================

    const candidateModels = [
      "gemini-3.1-flash-lite",
      "gemini-flash-latest",
      "gemini-2.5-flash",
      "gemini-3.8-flash",
    ];

    let streamedAnyChunk = false;
    let success = false;
    let lastError: any = null;

    for (const model of candidateModels) {
      if (streamedAnyChunk) break;

      try {
        const responseStream =
          await ai.models.generateContentStream({
            model,
            contents,
            config: {
              systemInstruction: dynamicSystemPrompt,
              temperature: 0.6,
              maxOutputTokens: 180,
            },
          });

        for await (const chunk of responseStream) {
          const text = chunk.text;

          if (text) {
            streamedAnyChunk = true;

            res.write(
              `data: ${JSON.stringify({
                text,
                done: false,
              })}\n\n`
            );
          }
        }

        success = true;
        break;
      } catch (err: any) {
        const status =
          err?.status ||
          err?.code ||
          (err?.message?.includes("503")
            ? 503
            : "err");

        console.warn(
          `[EVALYNTHIYA] Model ${model} temporarily unavailable (${status}). Cascading to next candidate...`
        );

        lastError = err;

        await new Promise((resolve) =>
          setTimeout(resolve, 80)
        );
      }
    }


    // ========================================================
    // NON-STREAMING FALLBACK
    // ========================================================

    if (!success && !streamedAnyChunk) {
      const fallbackModels = [
        "gemini-3.1-flash-lite",
        "gemini-flash-latest",
        "gemini-2.5-flash",
      ];

      for (const fModel of fallbackModels) {
        try {
          const fallbackRes =
            await ai.models.generateContent({
              model: fModel,
              contents,
              config: {
                systemInstruction: dynamicSystemPrompt,
                temperature: 0.6,
                maxOutputTokens: 180,
              },
            });

          const text = fallbackRes.text;

          if (text) {
            res.write(
              `data: ${JSON.stringify({
                text,
                done: false,
              })}\n\n`
            );

            success = true;
            break;
          }
        } catch (fErr: any) {
          console.warn(
            `[EVALYNTHIYA] Non-streaming fallback ${fModel} unavailable:`,
            fErr?.status || fErr?.message
          );
        }
      }
    }


    // ========================================================
    // GRACEFUL FALLBACK
    // ========================================================

    if (!success && !streamedAnyChunk) {
      const gracefulMessage =
        "I'm right here with you! The neural service had a brief moment of high demand, but I'm listening. How can I help you right now?";

      res.write(
        `data: ${JSON.stringify({
          text: gracefulMessage,
          done: false,
        })}\n\n`
      );
    }

    res.write(
      `data: ${JSON.stringify({
        done: true,
      })}\n\n`
    );

    res.end();
  } catch (error: any) {
    console.error(
      "Chat API Error:",
      error?.message || error
    );

    if (!res.headersSent) {
      res.status(500).json({
        error:
          error?.message ||
          "Failed to generate conversation response.",
      });
    } else {
      res.write(
        `data: ${JSON.stringify({
          error:
            error?.message ||
            "Stream encountered an error.",
          done: true,
        })}\n\n`
      );

      res.end();
    }
  }
});


// ============================================================
// 3. GEMINI TTS ENDPOINT
// ============================================================

app.post("/api/tts", async (req: Request, res: Response) => {
  try {
    const {
      text,
      voice = "Kore",
    } = req.body;

    if (!text || typeof text !== "string") {
      res.status(400).json({
        error: "Text string is required.",
      });

      return;
    }

    // Check TTS quota cooldown
    if (Date.now() < ttsQuotaCooldownUntil) {
      res.status(200).json({
        fallback: true,
        quotaExhausted: true,
        error:
          "Gemini TTS free-tier daily quota reached (limit: 10). Using fast browser speech synthesis.",
      });

      return;
    }

    const ai = getGenAI();

    // Generate speech
    const response = await ai.models.generateContent({
      model: "gemini-3.1-flash-tts-preview",
      contents: [
        {
          parts: [
            {
              text: text.trim(),
            },
          ],
        },
      ],
      config: {
        responseModalities: [Modality.AUDIO],

        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: {
              voiceName: voice || "Kore",
            },
          },
        },
      },
    });

    const candidate =
      response.candidates?.[0];

    const audioPart =
      candidate?.content?.parts?.find(
        (part: any) =>
          part.inlineData &&
          part.inlineData.data
      );

    if (audioPart && audioPart.inlineData) {
      res.json({
        audio: audioPart.inlineData.data,
        mimeType:
          audioPart.inlineData.mimeType ||
          "audio/pcm;rate=24000",
        sampleRate: 24000,
      });
    } else {
      res.status(200).json({
        error:
          "No audio data returned by the TTS service.",
        fallback: true,
      });
    }
  } catch (error: any) {
    const errMsg = String(
      error?.message || error
    );

    const isQuota =
      error?.status === 429 ||
      error?.code === 429 ||
      errMsg.includes("429") ||
      errMsg.includes("RESOURCE_EXHAUSTED") ||
      errMsg.includes("quota");

    if (isQuota) {
      ttsQuotaCooldownUntil =
        Date.now() + 6 * 60 * 60 * 1000;

      console.warn(
        "[EVALYNTHIYA] Gemini TTS free-tier quota limit reached (limit: 10/day). Activating automatic fallback to browser voice."
      );

      res.status(200).json({
        error:
          "Gemini TTS quota limit reached. Automatically using fast browser voice.",
        fallback: true,
        quotaExhausted: true,
      });

      return;
    }

    console.warn(
      `[EVALYNTHIYA] TTS service notice (${error?.status || 500}). Falling back to browser voice.`
    );

    res.status(200).json({
      error:
        error?.message ||
        "TTS generation failed",
      fallback: true,
    });
  }
});


// ============================================================
// 4. AUDIO TRANSCRIPTION ENDPOINT
// ============================================================

app.post(
  "/api/transcribe",
  async (req: Request, res: Response) => {
    try {
      const {
        audioData,
        mimeType = "audio/webm",
      } = req.body;

      if (!audioData) {
        res.status(400).json({
          error:
            "audioData base64 string is required.",
        });

        return;
      }

      const ai = getGenAI();

      const response =
        await ai.models.generateContent({
          model: "gemini-3.5-transcribe",

          contents: {
            parts: [
              {
                inlineData: {
                  data: audioData,
                  mimeType,
                },
              },
              {
                text:
                  "Transcribe the spoken audio verbatim in its original language (English, Bengali, or Hindi, or mixed). Do not translate. Output ONLY the transcription text.",
              },
            ],
          },
        });

      const transcript =
        response.text || "";

      res.json({
        transcript: transcript.trim(),
      });
    } catch (error: any) {
      console.error(
        "Transcribe API Error:",
        error?.message || error
      );

      res.status(500).json({
        error:
          error?.message ||
          "Failed to transcribe audio.",
      });
    }
  }
);


// ============================================================
// 5. SERVER + WEBSOCKET LIVE API + SPA
// ============================================================

async function startServer() {
  const server = http.createServer(app);


  // ==========================================================
  // GEMINI LIVE WEBSOCKET
  // ==========================================================

  const wss = new WebSocketServer({
    server,
    path: "/api/live",
  });

  wss.on(
    "connection",
    async (clientWs: WebSocket) => {
      let session: any = null;

      console.log(
        "[LIVE] Client WebSocket connected"
      );

      try {
        const ai = getGenAI();


        // ====================================================
        // CONNECT TO GEMINI LIVE
        // ====================================================

        console.log(
          "[LIVE] Connecting to Gemini Live..."
        );

        session = await ai.live.connect({
          model:
            "gemini-3.1-flash-live-preview",

          config: {
            responseModalities: [Modality.AUDIO],

            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: {
                  voiceName: "Kore",
                },
              },
            },

            // Enable transcription for debugging
            // and UI transcript support.
            inputAudioTranscription: {},
            outputAudioTranscription: {},

            systemInstruction:
              EVALYNTHIYA_SYSTEM_INSTRUCTION,
          },

          callbacks: {


            // ==================================================
            // GEMINI LIVE MESSAGE HANDLER
            // ==================================================

            onmessage: (
              message: LiveServerMessage
            ) => {
              const content =
                message.serverContent;

              if (!content) {
                return;
              }


              // ------------------------------------------------
              // MODEL TURN
              // ------------------------------------------------

              const parts =
                content.modelTurn?.parts ?? [];

              if (parts.length > 0) {
                console.log(
                  "[LIVE] Gemini model turn:",
                  parts.map((part: any) => ({
                    hasAudio: Boolean(
                      part.inlineData?.data
                    ),
                    hasText: Boolean(
                      part.text
                    ),
                  }))
                );


                // Process EVERY part.
                //
                // IMPORTANT:
                // Do NOT assume parts[0] is audio.
                // Gemini Live can return multiple parts.
                //
                for (const part of parts) {


                  // ------------------------------------------
                  // GENERATED AUDIO
                  // ------------------------------------------

                  if (
                    part.inlineData?.data &&
                    clientWs.readyState ===
                      WebSocket.OPEN
                  ) {
                    console.log(
                      "[LIVE] Forwarding audio chunk to client"
                    );

                    clientWs.send(
                      JSON.stringify({
                        audio:
                          part.inlineData.data,
                      })
                    );
                  }


                  // ------------------------------------------
                  // MODEL TEXT
                  // ------------------------------------------

                  if (
                    part.text &&
                    clientWs.readyState ===
                      WebSocket.OPEN
                  ) {
                    console.log(
                      "[LIVE] Forwarding model text:",
                      part.text
                    );

                    clientWs.send(
                      JSON.stringify({
                        text: part.text,
                      })
                    );
                  }
                }
              }


              // ------------------------------------------------
              // INTERRUPTION / BARGE-IN
              // ------------------------------------------------

              if (
                content.interrupted &&
                clientWs.readyState ===
                  WebSocket.OPEN
              ) {
                console.log(
                  "[LIVE] Gemini interrupted current response"
                );

                clientWs.send(
                  JSON.stringify({
                    interrupted: true,
                  })
                );
              }


              // ------------------------------------------------
              // INPUT AUDIO TRANSCRIPTION
              // ------------------------------------------------

              if (
                content.inputTranscription?.text &&
                clientWs.readyState ===
                  WebSocket.OPEN
              ) {
                console.log(
                  "[LIVE] User transcript:",
                  content.inputTranscription.text
                );

                clientWs.send(
                  JSON.stringify({
                    inputTranscript:
                      content.inputTranscription
                        .text,
                  })
                );
              }


              // ------------------------------------------------
              // OUTPUT AUDIO TRANSCRIPTION
              // ------------------------------------------------

              if (
                content.outputTranscription?.text &&
                clientWs.readyState ===
                  WebSocket.OPEN
              ) {
                console.log(
                  "[LIVE] Model transcript:",
                  content.outputTranscription.text
                );

                clientWs.send(
                  JSON.stringify({
                    outputTranscript:
                      content.outputTranscription
                        .text,
                  })
                );
              }


              // ------------------------------------------------
              // TURN COMPLETE
              // ------------------------------------------------

              if (
                content.turnComplete &&
                clientWs.readyState ===
                  WebSocket.OPEN
              ) {
                console.log(
                  "[LIVE] Gemini turn complete"
                );

                clientWs.send(
                  JSON.stringify({
                    turnComplete: true,
                  })
                );
              }
            },


            // ==================================================
            // GEMINI LIVE CLOSED
            // ==================================================

            onclose: () => {
              console.log(
                "[LIVE] Gemini Live session closed"
              );

              if (
                clientWs.readyState ===
                WebSocket.OPEN
              ) {
                clientWs.close();
              }
            },


            // ==================================================
            // GEMINI LIVE ERROR
            // ==================================================

            onerror: (err: any) => {
              console.error(
                "[LIVE] Gemini Live Session Error:",
                err
              );

              if (
                clientWs.readyState ===
                WebSocket.OPEN
              ) {
                clientWs.send(
                  JSON.stringify({
                    error:
                      err?.message ||
                      "Live API error",
                  })
                );
              }
            },
          },
        });


        // ======================================================
        // LIVE SESSION READY
        // ======================================================

        console.log(
          "[LIVE] Gemini Live session established"
        );

        if (
          clientWs.readyState ===
          WebSocket.OPEN
        ) {
          clientWs.send(
            JSON.stringify({
              ready: true,
            })
          );
        }


        // ======================================================
        // RECEIVE CLIENT LIVE INPUT
        // ======================================================

        let receivedAudioChunks = 0;

        clientWs.on(
          "message",
          (data: any) => {
            try {
              const parsed = JSON.parse(
                data.toString()
              );


              // ----------------------------------------------
              // MICROPHONE AUDIO
              // ----------------------------------------------

              if (parsed.audio) {
                receivedAudioChunks++;

                if (
                  receivedAudioChunks === 1 ||
                  receivedAudioChunks % 50 === 0
                ) {
                  console.log(
                    `[LIVE] Received ${receivedAudioChunks} audio chunks from client`
                  );
                }

                session.sendRealtimeInput({
                  audio: {
                    data: parsed.audio,
                    mimeType:
                      "audio/pcm;rate=16000",
                  },
                });
              }


              // ----------------------------------------------
              // TEXT INPUT
              // ----------------------------------------------

              else if (parsed.text) {
                console.log(
                  "[LIVE] Received text input:",
                  parsed.text
                );

                session.sendRealtimeInput({
                  text: parsed.text,
                });
              }
            } catch (inputErr) {
              console.error(
                "[LIVE] Error processing client live input:",
                inputErr
              );
            }
          }
        );


        // ======================================================
        // CLIENT CLOSED
        // ======================================================

        clientWs.on(
          "close",
          () => {
            console.log(
              "[LIVE] Client WebSocket closed"
            );

            try {
              session?.close?.();
            } catch {}
          }
        );
      } catch (connErr: any) {
        console.error(
          "[LIVE] Failed to establish Gemini Live session:",
          connErr
        );

        if (
          clientWs.readyState ===
          WebSocket.OPEN
        ) {
          clientWs.send(
            JSON.stringify({
              error:
                connErr?.message ||
                "Failed to initialize Live API session",
            })
          );

          clientWs.close();
        }
      }
    }
  );


  // ==========================================================
  // VITE DEVELOPMENT / PRODUCTION STATIC
  // ==========================================================

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
      },

      appType: "spa",
    });

    app.use(vite.middlewares);
  } else {
    const distPath = path.join(
      process.cwd(),
      "dist"
    );

    app.use(
      express.static(distPath)
    );

    app.get(
      "*",
      (_req: Request, res: Response) => {
        res.sendFile(
          path.join(
            distPath,
            "index.html"
          )
        );
      }
    );
  }


  // ==========================================================
  // START SERVER
  // ==========================================================

  server.listen(
    PORT,
    "0.0.0.0",
    () => {
      console.log(
        `EVALYNTHIYA Server running on http://0.0.0.0:${PORT}`
      );
    }
  );
}


// ============================================================
// FATAL STARTUP ERROR
// ============================================================

startServer().catch((err) => {
  console.error(
    "Fatal server startup error:",
    err
  );

  process.exit(1);
});