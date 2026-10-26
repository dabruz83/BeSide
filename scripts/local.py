#!/usr/bin/env python3
"""Run only this checkout's local demo; never connect to remote services."""
import json
import os
from pathlib import Path
import signal
import socket
import subprocess
import sys
import time
from urllib.request import urlopen
from dotenv import dotenv_values

ROOT = Path(__file__).resolve().parents[1]
LOCAL = ROOT / '.local'
PYTHON = ROOT / '.venv/bin/python'
NODE = next((LOCAL / 'runtime').glob('node-*/bin/node'))
MONGO = next((LOCAL / 'runtime').glob('mongodb-*/bin/mongod'))

def health(url):
    try:
        with urlopen(url, timeout=2) as r:
            return r.status == 200
    except Exception:
        return False

def launch(name, command, cwd, env):
    pidfile = LOCAL / f'{name}.pid'
    if pidfile.exists():
        try:
            os.kill(int(pidfile.read_text()), 0)
            return
        except PermissionError:
            return
        except (ProcessLookupError, ValueError):
            pass
    log = open(LOCAL / 'logs' / f'{name}.log', 'a')
    proc = subprocess.Popen(command, cwd=cwd, env=env, stdin=subprocess.DEVNULL,
                            stdout=log, stderr=log, start_new_session=True)
    pidfile.write_text(str(proc.pid))
    log.close()

def main():
    action = sys.argv[1] if len(sys.argv) > 1 else 'status'
    if action == 'stop':
        for name in ('frontend-recovery', 'backend-recovery', 'mongo'):
            p = LOCAL / f'{name}.pid'
            if p.exists():
                pid = int(p.read_text())
                # Refuse to signal a PID recycled by another process.
                command = subprocess.run(['ps', '-p', str(pid), '-o', 'command='], capture_output=True, text=True).stdout
                if str(ROOT) in command:
                    os.kill(pid, signal.SIGTERM)
        print('Stop requested for BeSide local processes; data retained.')
        return
    if action == 'start':
        config = dotenv_values(ROOT / 'backend/.env')
        if config.get('APP_ENV') != 'local' or config.get('MONGO_URL') != 'mongodb://127.0.0.1:27018' or config.get('DB_NAME') != 'beside_demo':
            raise SystemExit('Refusing to start: expected the isolated local demo configuration.')
        env = dict(os.environ)
        env.update({k: v for k, v in config.items() if v is not None})
        env['EXTERNAL_SERVICES_ENABLED'] = 'false'
        for folder in ('mongo', 'logs'):
            (LOCAL / folder).mkdir(parents=True, exist_ok=True)
        launch('mongo', [str(MONGO), '--dbpath', str(LOCAL / 'mongo'), '--bind_ip', '127.0.0.1', '--port', '27018'], ROOT, env)
        launch('backend-recovery', [str(PYTHON), '-m', 'uvicorn', 'server:app', '--host', '127.0.0.1', '--port', '8100', '--no-access-log'], ROOT / 'backend', env)
        frontend_env = dict(os.environ, PORT='3100', HOST='127.0.0.1', NODE_ENV='development', BACKEND_PROXY_URL='http://127.0.0.1:8100')
        launch('frontend-recovery', [str(NODE), str(ROOT / 'frontend/server.js')], ROOT / 'frontend', frontend_env)
        for _ in range(40):
            if health('http://127.0.0.1:8100/health') and health('http://localhost:3100/health'):
                break
            time.sleep(0.5)
        else:
            raise SystemExit('Startup failed: inspect .local/logs (secrets are not printed).')
    from pymongo import MongoClient
    with MongoClient('mongodb://127.0.0.1:27018', serverSelectionTimeoutMS=1000) as client:
        mongo_ok = client.admin.command('ping')['ok'] == 1
    print(json.dumps({'frontend': health('http://localhost:3100/health'), 'backend': health('http://127.0.0.1:8100/health'), 'mongodb': mongo_ok, 'url': 'http://localhost:3100'}))

if __name__ == '__main__':
    main()
