"""Flask API for the IRRIGUIDE Gemini advisor. Keeps GEMINI_KEY server-side -
never sent to or embedded in the React frontend.
"""
import os

import google.generativeai as genai
from dotenv import load_dotenv
from flask import Flask, jsonify, request
from flask_cors import CORS

from block_context import get_block_context

load_dotenv()

GEMINI_KEY = os.environ.get("GEMINI_KEY")
if GEMINI_KEY:
    genai.configure(api_key=GEMINI_KEY)
    model = genai.GenerativeModel("gemini-2.5-flash")
else:
    model = None

app = Flask(__name__)

# Allowed origins: the CRA dev server plus the deployed GitHub Pages site.
# Add any other origin (e.g. a custom domain) here too.
ALLOWED_ORIGINS = [
    "http://localhost:3000",
    "https://tommee-arch.github.io",
]
CORS(app, resources={r"/api/*": {"origins": ALLOWED_ORIGINS}})


def _to_gemini_history(history):
    """Frontend chat bubbles are {sender: 'user' | 'gemini', text}. Gemini's
    chat history wants {role: 'user' | 'model', parts: [text]}."""
    gemini_history = []
    for msg in history or []:
        text = (msg.get("text") or "").strip()
        if not text:
            continue
        role = "user" if msg.get("sender") == "user" else "model"
        gemini_history.append({"role": role, "parts": [text]})
    return gemini_history


def ask_advisor(block_id, question, history):
    if model is None:
        raise RuntimeError("GEMINI_KEY is not configured on the server.")

    ctx = get_block_context(block_id)
    system = f"""You are an irrigation advisor for Tokara vineyard.
Answer briefly and practically, in plain language for a farm manager.
Base every answer ONLY on this data:
Block {ctx.block_id} | Cultivar {ctx.cultivar} | Stage: {ctx.stage} (day {ctx.stage_day})
Daily ETa {ctx.eta} mm | Weekly deficit {ctx.deficit} mm | PWDI {ctx.pwdi} ({ctx.priority})
Recommended volume {ctx.volume} m³ | Forecast: {ctx.weather_summary}
PWDI weights: deficit 0.40, ETa 0.30, stage 0.20, cultivar 0.10
If asked something the data can't answer, say so rather than guessing."""

    chat = model.start_chat(history=_to_gemini_history(history))
    response = chat.send_message(system + "\n\nQuestion: " + question)
    return response.text, ctx


@app.route("/api/health", methods=["GET"])
def health():
    return jsonify({"status": "ok", "gemini_configured": model is not None})


@app.route("/api/ask", methods=["POST"])
def ask():
    payload = request.get_json(silent=True) or {}
    block_id = payload.get("block_id")
    question = (payload.get("question") or "").strip()
    history = payload.get("history") or []

    if not block_id or not question:
        return jsonify({"error": "block_id and question are required."}), 400

    try:
        answer, ctx = ask_advisor(block_id, question, history)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 404
    except RuntimeError as exc:
        return jsonify({"error": str(exc)}), 503
    except Exception:
        app.logger.exception("ask_advisor failed for block %s", block_id)
        return jsonify({"error": "Something went wrong generating a response."}), 500

    return jsonify({
        "answer": answer,
        "context": {
            "stage": ctx.stage,
            "stage_day": ctx.stage_day,
            "eta": ctx.eta,
            "deficit": ctx.deficit,
            "pwdi": ctx.pwdi,
            "priority": ctx.priority,
            "volume": ctx.volume,
        },
    })


if __name__ == "__main__":
    app.run(debug=True, port=int(os.environ.get("PORT", 5000)))
