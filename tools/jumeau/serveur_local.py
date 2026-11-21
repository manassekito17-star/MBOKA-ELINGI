#!/usr/bin/env python3
"""
Petit serveur web local pour tester le jumeau numérique (Windows, Linux, Mac).
Il gère les requêtes HTTP « Range », indispensables aux fichiers PMTiles.

Usage (depuis la racine du dépôt) :
  python tools/jumeau/serveur_local.py           puis ouvrir http://localhost:8080/
"""
import http.server
import os
import re
import sys

RACINE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "web", "kinshasa")
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8080


class Gestionnaire(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k):
        super().__init__(*a, directory=RACINE, **k)

    def send_head(self):
        rng = self.headers.get("Range")
        path = self.translate_path(self.path)
        if not rng or not os.path.isfile(path):
            return super().send_head()
        m = re.match(r"bytes=(\d+)-(\d*)", rng)
        if not m:
            return super().send_head()
        size = os.path.getsize(path)
        start = int(m.group(1))
        end = min(int(m.group(2)) if m.group(2) else size - 1, size - 1)
        f = open(path, "rb")
        f.seek(start)
        self.send_response(206)
        self.send_header("Content-Type", self.guess_type(path))
        self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
        self.send_header("Content-Length", str(end - start + 1))
        self.send_header("Accept-Ranges", "bytes")
        self.end_headers()
        self._reste = end - start + 1
        return f

    def copyfile(self, source, outputfile):
        reste = getattr(self, "_reste", None)
        if reste is None:
            return super().copyfile(source, outputfile)
        while reste > 0:
            bloc = source.read(min(65536, reste))
            if not bloc:
                break
            outputfile.write(bloc)
            reste -= len(bloc)
        self._reste = None


if __name__ == "__main__":
    print(f"Kinshasa 3D : http://localhost:{PORT}/  (Ctrl+C pour arrêter)")
    http.server.ThreadingHTTPServer(("", PORT), Gestionnaire).serve_forever()
