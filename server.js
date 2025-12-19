import "dotenv/config";
import express from "express";
import cors from "cors";
import OpenAI from "openai";
import rateLimit from "express-rate-limit";

const app = express();

// Trust proxy - 讓 Express 信任 Render 的反向代理
app.set('trust proxy', 1);

// Rate limiting - 全域限制（所有人加起來）
const globalLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000, // 24 小時
  max: 100, // 一天最多 100 次請求
  message: {
    success: false,
    error: "今日請求次數已達上限，請明天再試",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Middleware
app.use(
  cors({
    origin: [
      "https://vue-profit-calculate.vercel.app", // 生產環境
      "http://localhost:5173", // 本地開發 (Vite 預設端口)
      "http://localhost:4173", // 本地 preview
    ],
    credentials: true,
  })
);
app.use(express.json());
app.use("/chat-stream", globalLimiter); // 只對 /chat-stream 路由限流

// OpenAI Configuration
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Chat endpoint (原本的，保留)
// app.post("/chat", async (req, res) => {
//   try {
//     const { prompt } = req.body;

//     const completion = await openai.chat.completions.create({
//       model: "gpt-5.1",
//       messages: [
//         {
//           role: "system",
//           content:
//             "你是工具精靈，由天才承澤創造的天才 AI 助手。請用專業且友善的語氣回答問題。",
//         },
//         { role: "user", content: prompt },
//       ],
//       max_completion_tokens: 2048,
//       temperature: 0,
//     });

//     res.json({
//       success: true,
//       message: completion.choices[0].message.content,
//     });
//   } catch (error) {
//     console.error("Error:", error.message);
//     res.status(500).json({
//       success: false,
//       error: error.message,
//     });
//   }
// });

// Chat streaming endpoint (新的)
app.post("/chat-stream", async (req, res) => {
  try {
    const { prompt } = req.body;

    // 設定 SSE headers
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    const stream = await openai.chat.completions.create({
      model: "gpt-5.1",
      messages: [
        {
          role: "system",
          content:
            "你是工具精靈，由天才承澤創造的天才 AI 助手。請用專業且友善的語氣回答問題。",
        },
        { role: "user", content: prompt },
      ],
      max_completion_tokens: 2048,
      temperature: 0,
      stream: true, // 開啟 streaming
    });

    // 邊收到邊傳給前端
    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) {
        res.write(`data: ${JSON.stringify({ content })}\n\n`);
      }
    }

    res.write("data: [DONE]\n\n");
    res.end();
  } catch (error) {
    console.error("Error:", error.message);
    res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
    res.end();
  }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
