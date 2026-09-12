#!/usr/bin/env python3
"""
SNOW AI — Native Desktop Actuator Bridge
100% Real Linux Desktop Automation via mss and pyautogui.
Handles screenshot capture, pointer movements, clicks, typing, hotkeys, and app launches.
"""

import sys
import os
import json
import base64
import glob
import subprocess
from io import BytesIO

# ── Ensure Display & XWayland Authentication ──────────────────────────────────
os.environ.setdefault("DISPLAY", ":0")

# Auto-merge Mutter XWayland auth cookie if needed
try:
    uid = os.getuid()
    mutter_auth_files = glob.glob(f"/run/user/{uid}/.mutter-Xwaylandauth*")
    if mutter_auth_files:
        auth_path = mutter_auth_files[0]
        os.environ["XAUTHORITY"] = auth_path
        # Extract and register cookie in ~/.Xauthority for seamless Xlib connection
        cmd = f"xauth -f {auth_path} list 2>/dev/null | awk '{{print $3}}' | head -n 1"
        cookie = subprocess.check_output(cmd, shell=True, text=True).strip()
        if cookie:
            subprocess.run(f"xauth add :0 MIT-MAGIC-COOKIE-1 {cookie} 2>/dev/null", shell=True)
            subprocess.run(f"xauth add {os.uname().nodename}:0 MIT-MAGIC-COOKIE-1 {cookie} 2>/dev/null", shell=True)
except Exception as e:
    pass

import mss
import pyautogui
from PIL import Image

pyautogui.FAILSAFE = True   # Standard fail-safe: moving mouse to corner triggers safety abort
pyautogui.PAUSE = 0.05      # Snappy 50ms action cadence

def get_screen_status():
    size = pyautogui.size()
    pos = pyautogui.position()
    return {
        "success": True,
        "width": size.width,
        "height": size.height,
        "mouse": {"x": pos.x, "y": pos.y},
        "display": os.environ.get("DISPLAY", ":0")
    }

def take_screenshot(downscale_max: int = 1280):
    try:
        with mss.MSS() as sct:
            # Monitor 1 is typically primary screen
            monitor = sct.monitors[1] if len(sct.monitors) > 1 else sct.monitors[0]
            sct_img = sct.grab(monitor)
            img = Image.frombytes("RGB", sct_img.size, sct_img.bgra, "raw", "BGRX")
            
            orig_w, orig_h = img.size
            if max(orig_w, orig_h) > downscale_max:
                scale = downscale_max / max(orig_w, orig_h)
                new_w = int(orig_w * scale)
                new_h = int(orig_h * scale)
                img = img.resize((new_w, new_h), Image.Resampling.LANCZOS)

            buffer = BytesIO()
            img.save(buffer, format="JPEG", quality=82)
            b64_str = base64.b64encode(buffer.getvalue()).decode("utf-8")
            data_url = f"data:image/jpeg;base64,{b64_str}"

            return {
                "success": True,
                "width": orig_w,
                "height": orig_h,
                "scaledWidth": img.size[0],
                "scaledHeight": img.size[1],
                "image": data_url
            }
    except Exception as e:
        return {"success": False, "error": f"Screenshot failed: {str(e)}"}

def execute_action(action: str, **kwargs):
    try:
        if action == "move":
            x = int(kwargs.get("x", 0))
            y = int(kwargs.get("y", 0))
            pyautogui.moveTo(x, y, duration=0.15)
            pos = pyautogui.position()
            return {"success": True, "action": "move", "mouse": {"x": pos.x, "y": pos.y}}

        elif action == "click":
            x = int(kwargs.get("x", pyautogui.position().x))
            y = int(kwargs.get("y", pyautogui.position().y))
            button = kwargs.get("button", "left")
            clicks = int(kwargs.get("clicks", 1))
            pyautogui.click(x=x, y=y, clicks=clicks, button=button)
            return {"success": True, "action": "click", "x": x, "y": y, "button": button, "clicks": clicks}

        elif action == "double_click":
            x = int(kwargs.get("x", pyautogui.position().x))
            y = int(kwargs.get("y", pyautogui.position().y))
            pyautogui.doubleClick(x=x, y=y)
            return {"success": True, "action": "double_click", "x": x, "y": y}

        elif action == "right_click":
            x = int(kwargs.get("x", pyautogui.position().x))
            y = int(kwargs.get("y", pyautogui.position().y))
            pyautogui.rightClick(x=x, y=y)
            return {"success": True, "action": "right_click", "x": x, "y": y}

        elif action == "type":
            text = str(kwargs.get("text", ""))
            pyautogui.write(text, interval=0.02)
            press_enter = bool(kwargs.get("press_enter", False))
            if press_enter:
                pyautogui.press("enter")
            return {"success": True, "action": "type", "chars": len(text), "press_enter": press_enter}

        elif action == "hotkey":
            keys = kwargs.get("keys", [])
            if isinstance(keys, list) and len(keys) > 0:
                pyautogui.hotkey(*keys)
                return {"success": True, "action": "hotkey", "keys": keys}
            return {"success": False, "error": "Missing keys array"}

        elif action == "scroll":
            amount = int(kwargs.get("amount", -5))
            pyautogui.scroll(amount)
            return {"success": True, "action": "scroll", "amount": amount}

        elif action == "launch":
            target = str(kwargs.get("target", "")).strip()
            if not target:
                return {"success": False, "error": "Target cannot be empty"}
            subprocess.Popen(["xdg-open", target], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            return {"success": True, "action": "launch", "target": target}

        else:
            return {"success": False, "error": f"Unknown action '{action}'"}

    except pyautogui.FailSafeException:
        return {"success": False, "error": "FailSafe engaged: Pointer moved to emergency corner to abort desktop automation"}
    except Exception as e:
        return {"success": False, "error": f"Action failed: {str(e)}"}

def main():
    if len(sys.argv) < 2:
        print(json.dumps({"success": False, "error": "Missing command argument"}))
        sys.exit(1)

    cmd = sys.argv[1].lower()

    if cmd == "status":
        print(json.dumps(get_screen_status()))

    elif cmd == "screenshot":
        max_dim = int(sys.argv[2]) if len(sys.argv) > 2 else 1280
        print(json.dumps(take_screenshot(max_dim)))

    elif cmd == "action":
        # Read JSON payload from stdin or argument
        payload = {}
        if len(sys.argv) > 2:
            try:
                payload = json.loads(sys.argv[2])
            except:
                pass
        if not payload and not sys.stdin.isatty():
            try:
                payload = json.load(sys.stdin)
            except:
                pass

        action_name = payload.pop("action", "")
        print(json.dumps(execute_action(action_name, **payload)))

    else:
        print(json.dumps({"success": False, "error": f"Unknown command '{cmd}'"}))

if __name__ == "__main__":
    main()
