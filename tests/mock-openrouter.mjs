// A stand-in for OpenRouter, used only by the tests. It speaks the same
// chat-completions shape, so the real serverless function runs unchanged.
// Markers in the letter text choose how it behaves; calls are counted per letter "Ref:".
import { createServer } from "node:http";

const PORT = 5198;
const calls = new Map();

const goodAnswer = {
  difficultWords: [
    { term: "furnish", meaning: "Give or send." },
    { term: "disallowed", meaning: "Turned down." },
    { term: "Fuel Allowance", meaning: "Money to help pay for heating." },
    { term: "remuneration", meaning: "This word is not in the letter, so it must be dropped." },
  ],
  simpleVersion: [
    "We got your form for Fuel Allowance.",
    "You must furnish proof of the money your home gets.",
    "Send it within 21 days.",
    "If you do not, we may say no.",
  ],
  checklist: {
    mustHave: ["Proof of the money your home gets, within 21 days"],
    optional: [],
    onlyIfNeeded: ["If your address changed, tell us your new address"],
  },
};

function read(req) {
  return new Promise((resolve) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => resolve(body));
  });
}

createServer(async (req, res) => {
  const send = (status, body) => {
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(body));
  };
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);

  if (url.pathname === "/health") return send(200, { ok: true });
  if (url.pathname === "/calls") return send(200, calls.get(url.searchParams.get("ref")) ?? { count: 0 });

  if (req.method === "POST" && url.pathname === "/api/v1/chat/completions") {
    const body = JSON.parse(await read(req));
    const letter = body.messages.at(-1).content;
    const ref = /Ref: (\S+)/.exec(letter)?.[1] ?? "none";
    const seen = calls.get(ref) ?? { count: 0 };
    seen.count += 1;
    seen.auth = req.headers.authorization;
    seen.model = body.model;
    seen.jsonMode = body.response_format?.type === "json_object";
    seen.textOnly = body.messages.every((message) => typeof message.content === "string");
    calls.set(ref, seen);

    if (letter.includes("UPSTREAM-DOWN")) return send(500, { error: "boom" });
    const bad =
      letter.includes("BADJSON-ALWAYS") || (letter.includes("BADJSON-ONCE") && seen.count === 1);
    const content = bad
      ? "Sure! Here is the answer: { difficultWords: oops"
      : letter.includes("FENCED")
        ? "```json\n" + JSON.stringify(goodAnswer) + "\n```"
        : JSON.stringify(goodAnswer);
    return send(200, { choices: [{ message: { role: "assistant", content } }] });
  }
  send(404, { error: "not found" });
}).listen(PORT, "127.0.0.1", () => console.log(`mock OpenRouter on ${PORT}`));
