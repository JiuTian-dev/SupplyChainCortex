#!/usr/bin/env python3
"""九天记忆桥接服务 — JiuTian Memory ↔ SupplyChain Cortex

轻量 HTTP 服务，包装九天记忆模块的核心能力（record/retrieve/health），
供 Node.js 端通过 fetch 调用。

启动: python server.py --port 8765
"""
import sys
import os
import json
import argparse
from http.server import HTTPServer, BaseHTTPRequestHandler

# Add JiuTian_memory to path — it lives next to jiadian_supply
JIUTIAN_PATH = os.path.join(os.path.dirname(__file__), "..", "..", "..", "..", "..", "JiuTian_memory")
JIUTIAN_PATH = os.path.abspath(JIUTIAN_PATH)
sys.path.insert(0, JIUTIAN_PATH)

from dotenv import load_dotenv
load_dotenv(os.path.join(JIUTIAN_PATH, ".env"))

# Adjust logging — suppress noisy libraries
import logging
logging.getLogger("httpx").setLevel(logging.WARNING)
logging.getLogger("httpcore").setLevel(logging.WARNING)
logging.getLogger("qdrant_client").setLevel(logging.WARNING)
logging.getLogger("mem0.vector_stores").setLevel(logging.WARNING)
logging.basicConfig(level=logging.INFO, format="%(asctime)s [memory-bridge] %(message)s")
logger = logging.getLogger("memory-bridge")

# Lazy-init services
_service = None


def get_service():
    global _service
    if _service is None:
        from src.mem0_client import Mem0Client
        from src.llm_client import LLMClient
        from src.benchmark_logger import BenchmarkLogger
        from src.hard_facts_store import HardFactsStore
        from src.conversation_logger import ConversationLogger
        from src.chinese_embedding import ChineseEmbeddingStore
        from src.memory_service import MemoryService

        db_dir = os.path.join(JIUTIAN_PATH, "data")
        os.makedirs(db_dir, exist_ok=True)

        mem0 = Mem0Client()
        llm = LLMClient()
        benchmark = BenchmarkLogger(log_dir=os.path.join(JIUTIAN_PATH, "benchmark_logs"))
        hfs = HardFactsStore(db_path=os.path.join(db_dir, "jiutian_prod.db"))
        conv_logger = ConversationLogger(db_path=os.path.join(db_dir, "jiutian_prod_conv.db"))
        cn_embed = ChineseEmbeddingStore()
        _service = MemoryService(
            mem0_client=mem0, llm_client=llm, benchmark_logger=benchmark,
            hard_facts_store=hfs, conversation_logger=conv_logger,
            chinese_embedding=cn_embed,
        )
        logger.info("JiuTian memory service initialized")
    return _service


class MemoryHandler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        logger.info("%s %s", self.command, self.path)

    def _send_json(self, data, status=200):
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _read_body(self):
        length = int(self.headers.get("Content-Length", 0))
        if length == 0:
            return {}
        return json.loads(self.rfile.read(length))

    def do_GET(self):
        if self.path == "/health":
            self._send_json({"status": "ok", "service": "jiutian-memory-bridge"})
        else:
            self._send_json({"error": "not found"}, 404)

    def do_POST(self):
        try:
            body = self._read_body()
            svc = get_service()

            if self.path == "/record":
                user_input = body.get("user_input", "")
                response = body.get("response", "")
                user_id = body.get("user_id", "default")
                mode = body.get("mode", "memory")
                result = svc.chat(user_input, user_id=user_id, mode=mode)
                self._send_json({
                    "status": "ok",
                    "hard_facts_count": result.get("benchmark", {}).get("hard_facts_count", 0),
                    "memories_count": result.get("benchmark", {}).get("memories_count", 0),
                })

            elif self.path == "/retrieve":
                query = body.get("query", "")
                user_id = body.get("user_id", "default")
                # Use chat with the query to retrieve + respond
                result = svc.chat(query, user_id=user_id, mode="memory")
                # Return only the response for direct use
                self._send_json({
                    "status": "ok",
                    "response": result.get("response", ""),
                    "hard_facts": [f.get("content", "") for f in result.get("hard_facts_used", [])],
                    "memories": [m.get("memory", "") for m in result.get("memories_used", [])],
                    "benchmark": result.get("benchmark", {}),
                })

            elif self.path == "/ingest":
                conversation_text = body.get("conversation_text", "")
                user_id = body.get("user_id", "default")
                result = svc.ingest(conversation_text, user_id=user_id)
                self._send_json({"status": result.get("status", "ok"), "extracted": result.get("extracted")})

            else:
                self._send_json({"error": "unknown endpoint"}, 404)

        except Exception as e:
            logger.error("Error handling %s: %s", self.path, e)
            self._send_json({"status": "error", "error": str(e)}, 500)


def main():
    parser = argparse.ArgumentParser(description="JiuTian Memory Bridge")
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--host", default="127.0.0.1")
    args = parser.parse_args()

    server = HTTPServer((args.host, args.port), MemoryHandler)
    logger.info("Memory bridge listening on %s:%d", args.host, args.port)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        logger.info("Shutting down")
        server.shutdown()


if __name__ == "__main__":
    main()
