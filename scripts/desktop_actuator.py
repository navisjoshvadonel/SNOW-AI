#!/usr/bin/env python3
"""
SNOW AI — Native Desktop Actuator Bridge
100% Real Linux Desktop Automation via mss, pyautogui, and visual verification.
Handles screenshot capture, pointer movements, clicks, typing, hotkeys, app launches,
and closed-loop visual delta state verification.
"""

import sys
import os
import json
import base64
import glob
import time
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
except Exception:
    pass

import mss
import pyautogui
from PIL import Image, ImageChops

pyautogui.FAILSAFE = True   # Standard fail-safe: moving mouse to corner triggers safety abort
pyautogui.PAUSE = 0.05      # Snappy 50ms action cadence


def get_active_window_info():
    """Extract active Linux X11/Wayland window details using xprop or fallback."""
    try:
        out = subprocess.check_output(
            "xprop -root _NET_ACTIVE_WINDOW 2>/dev/null",
            shell=True, text=True
        ).strip()
        win_id = None
        for part in out.split():
            if part.startswith("0x") and part != "0x0":
                win_id = part.rstrip(",")
                break

        if win_id:
            win_out = subprocess.check_output(
                f"xprop -id {win_id} WM_NAME WM_CLASS 2>/dev/null",
                shell=True, text=True
            ).strip()
            title = "Unknown"
            wm_class = "Unknown"
            for line in win_out.splitlines():
                if "WM_NAME(" in line or "WM_NAME =" in line:
                    parts = line.split("=", 1)
                    if len(parts) > 1:
                        title = parts[1].strip().strip('"')
                elif "WM_CLASS(" in line or "WM_CLASS =" in line:
                    parts = line.split("=", 1)
                    if len(parts) > 1:
                        wm_class = parts[1].strip().replace('"', '')
            return {"id": win_id, "title": title, "class": wm_class}
    except Exception:
        pass
    return {"id": "0x0", "title": "Linux Desktop / Active Session", "class": "desktop"}


def get_screen_status():
    size = pyautogui.size()
    pos = pyautogui.position()
    active_win = get_active_window_info()
    return {
        "success": True,
        "width": size.width,
        "height": size.height,
        "mouse": {"x": pos.x, "y": pos.y},
        "display": os.environ.get("DISPLAY", ":0"),
        "activeWindow": active_win
    }


def capture_pil_image():
    """Captures raw PIL image directly from MSS display buffer."""
    with mss.MSS() as sct:
        monitor = sct.monitors[1] if len(sct.monitors) > 1 else sct.monitors[0]
        sct_img = sct.grab(monitor)
        img = Image.frombytes("RGB", sct_img.size, sct_img.bgra, "raw", "BGRX")
        return img, img.size[0], img.size[1]


def image_to_base64_jpeg(img: Image.Image, downscale_max: int = 1280, quality: int = 82) -> str:
    """Encodes PIL Image to Base64 JPEG data URL with optional downscaling."""
    orig_w, orig_h = img.size
    if max(orig_w, orig_h) > downscale_max:
        scale = downscale_max / max(orig_w, orig_h)
        new_w = int(orig_w * scale)
        new_h = int(orig_h * scale)
        img = img.resize((new_w, new_h), Image.Resampling.LANCZOS)

    buffer = BytesIO()
    img.save(buffer, format="JPEG", quality=quality)
    b64_str = base64.b64encode(buffer.getvalue()).decode("utf-8")
    return f"data:image/jpeg;base64,{b64_str}"


def take_screenshot(downscale_max: int = 1280):
    try:
        img, orig_w, orig_h = capture_pil_image()
        data_url = image_to_base64_jpeg(img, downscale_max=downscale_max)
        return {
            "success": True,
            "width": orig_w,
            "height": orig_h,
            "image": data_url
        }
    except Exception as e:
        return {"success": False, "error": f"Screenshot failed: {str(e)}"}


def calculate_visual_delta(img1: Image.Image, img2: Image.Image, threshold: int = 15) -> dict:
    """
    Computes high-speed perceptual visual delta between two frames.
    Resizes both to a standardized 320x180 grayscale grid (~3ms).
    """
    try:
        grid_w, grid_h = 320, 180
        g1 = img1.resize((grid_w, grid_h), Image.Resampling.BILINEAR).convert("L")
        g2 = img2.resize((grid_w, grid_h), Image.Resampling.BILINEAR).convert("L")
        diff = ImageChops.difference(g1, g2)
        histogram = diff.histogram()
        changed_pixels = sum(histogram[threshold:])
        total_pixels = grid_w * grid_h
        delta_pct = round((changed_pixels / total_pixels) * 100, 2)
        bbox = diff.getbbox()

        # Any change >= 0.15% of screen indicates a meaningful visual transition
        state_changed = delta_pct >= 0.15

        return {
            "deltaPct": delta_pct,
            "stateChanged": state_changed,
            "changedBbox": list(bbox) if bbox else None
        }
    except Exception as e:
        return {
            "deltaPct": 0.0,
            "stateChanged": False,
            "error": str(e)
        }


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

        elif action == "press":
            key = str(kwargs.get("key", "enter")).lower()
            pyautogui.press(key)
            return {"success": True, "action": "press", "key": key}

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

        elif action == "drag":
            start_x = int(kwargs.get("startX", pyautogui.position().x))
            start_y = int(kwargs.get("startY", pyautogui.position().y))
            end_x = int(kwargs.get("endX", start_x))
            end_y = int(kwargs.get("endY", start_y))
            duration = float(kwargs.get("duration", 0.3))
            pyautogui.moveTo(start_x, start_y)
            pyautogui.dragTo(end_x, end_y, duration=duration, button="left")
            return {"success": True, "action": "drag", "from": {"x": start_x, "y": start_y}, "to": {"x": end_x, "y": end_y}}

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


def execute_verified_action(action: str, **kwargs):
    """
    Closed-Loop Actuator Protocol:
    1. Capture pre-action visual state & active window
    2. Perform requested actuation
    3. Settle delay (allow OS/UI animations to resolve)
    4. Capture post-action visual state & active window
    5. Compute visual delta & state change verification
    """
    try:
        settle_delay = float(kwargs.pop("settleDelay", 0.25))
        include_screenshots = bool(kwargs.pop("includeScreenshots", False))
        max_dim = int(kwargs.pop("maxDim", 1280))

        # 1. Pre-state capture
        pre_img, w, h = capture_pil_image()
        pre_window = get_active_window_info()

        # 2. Actuation
        action_res = execute_action(action, **kwargs)
        if not action_res.get("success"):
            return {
                "success": False,
                "action": action,
                "error": action_res.get("error", "Action execution failed"),
                "stateChanged": False,
                "visualDeltaPct": 0.0
            }

        # 3. Settle
        time.sleep(settle_delay)

        # 4. Post-state capture
        post_img, _, _ = capture_pil_image()
        post_window = get_active_window_info()

        # 5. Visual & Context Delta
        delta_info = calculate_visual_delta(pre_img, post_img)
        window_changed = (pre_window.get("id") != post_window.get("id")) or (pre_window.get("title") != post_window.get("title"))
        state_changed = delta_info.get("stateChanged", False) or window_changed

        result = {
            "success": True,
            "action": action,
            "details": action_res,
            "stateChanged": state_changed,
            "visualDeltaPct": delta_info.get("deltaPct", 0.0),
            "changedBbox": delta_info.get("changedBbox"),
            "preWindow": pre_window,
            "postWindow": post_window,
            "windowChanged": window_changed,
            "settleDelay": settle_delay
        }

        if include_screenshots:
            result["preScreenshot"] = image_to_base64_jpeg(pre_img, downscale_max=max_dim)
            result["postScreenshot"] = image_to_base64_jpeg(post_img, downscale_max=max_dim)

        return result
    except Exception as e:
        return {"success": False, "error": f"Verified action failed: {str(e)}", "stateChanged": False}


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
        payload = {}
        if len(sys.argv) > 2:
            try:
                payload = json.loads(sys.argv[2])
            except Exception:
                pass
        if not payload and not sys.stdin.isatty():
            try:
                payload = json.load(sys.stdin)
            except Exception:
                pass

        action_name = payload.pop("action", "")
        print(json.dumps(execute_action(action_name, **payload)))

    elif cmd == "verified_action":
        payload = {}
        if len(sys.argv) > 2:
            try:
                payload = json.loads(sys.argv[2])
            except Exception:
                pass
        if not payload and not sys.stdin.isatty():
            try:
                payload = json.load(sys.stdin)
            except Exception:
                pass

        action_name = payload.pop("action", "")
        print(json.dumps(execute_verified_action(action_name, **payload)))

    else:
        print(json.dumps({"success": False, "error": f"Unknown command '{cmd}'"}))


if __name__ == "__main__":
    main()
