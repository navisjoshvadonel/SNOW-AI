#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# SNOW AI — Fingerprint Enrollment Setup
# Run this ONCE to register your fingerprint with fprintd.
# After this, Snow will use your fingerprint as the access gate.
# ─────────────────────────────────────────────────────────────────────────────
set -e

USER="${1:-$USER}"
FINGER="${2:-right-index-finger}"

echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║          SNOW AI — BIOMETRIC ENROLLMENT              ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""
echo "  User    : $USER"
echo "  Finger  : $FINGER"
echo ""
echo "  Available fingers:"
echo "  left-thumb, left-index-finger, left-middle-finger,"
echo "  left-ring-finger, left-little-finger,"
echo "  right-thumb, right-index-finger, right-middle-finger,"
echo "  right-ring-finger, right-little-finger"
echo ""

# Note: fprintd is automatically started on-demand by systemd D-Bus activation when needed.

# Check for existing enrollments safely without triggering set -e
echo "[*] Checking for existing enrolled fingerprints..."
EXISTING=$(fprintd-list "$USER" 2>&1 || true)
echo "$EXISTING"

if echo "$EXISTING" | grep -qi "No devices available"; then
  echo ""
  echo "╔════════════════════════════════════════════════════════════════════╗"
  echo "║                  [!] NO FINGERPRINT DEVICE FOUND                   ║"
  echo "╚════════════════════════════════════════════════════════════════════╝"
  echo ""
  echo "Scanning system USB bus for fingerprint hardware..."
  HW=$(lsusb | grep -i "elan\|fingerprint\|validity\|synaptics\|goodix" || true)
  if [[ -n "$HW" ]]; then
    echo "Detected hardware:"
    echo "  $HW"
    echo ""
    if echo "$HW" | grep -q "04f3:0c00"; then
      echo "► Root Cause Identified:"
      echo "  Your laptop has the ELAN Match-on-Chip sensor (ID 04f3:0c00)."
      echo "  Standard Ubuntu libfprint does not include this driver out-of-the-box."
      echo "  It requires the community 'elanmoc2' libfprint driver branch."
      echo ""
      echo "► Two Options to Proceed:"
      echo "  1) Compile elanmoc2 driver for Ubuntu (enables native 04f3:0c00 sensor):"
      echo "     sudo apt install -y meson ninja-build libglib2.0-dev libgusb-dev libnss3-dev libpixman-1-dev libcairo2-dev libgudev-1.0-dev libgirepository1.0-dev libssl-dev"
      echo "     git clone --depth 1 -b elanmoc2 https://gitlab.freedesktop.org/depau/libfprint.git /tmp/libfprint"
      echo "     cd /tmp/libfprint && meson setup builddir -Ddoc=false && sudo ninja -C builddir install && sudo ldconfig && sudo systemctl restart fprintd"
      echo ""
      echo "  2) Or use the SNOW Master Passcode / PIN Gate right now."
      echo "     (Snow also supports emergency master passcode login on the gate screen)."
    fi
  else
    echo "No recognized biometric device found on the USB bus."
  fi
  exit 1
fi

if echo "$EXISTING" | grep -qi "right-index-finger\|left-index-finger"; then
  echo ""
  echo "[!] A fingerprint is already enrolled."
  read -p "    Delete existing and re-enroll? [y/N]: " CONFIRM
  if [[ "$CONFIRM" =~ ^[Yy]$ ]]; then
    fprintd-delete "$USER"
    echo "[*] Existing fingerprints deleted."
  else
    echo "[*] Keeping existing fingerprints. Snow auth should already work."
    exit 0
  fi
fi

echo ""
echo "[*] Starting enrollment for finger: $FINGER"
echo "[*] You'll need to lift and place your finger multiple times."
echo "    Follow the prompts from fprintd below:"
echo ""

fprintd-enroll -f "$FINGER" "$USER"

echo ""
echo "[✓] Enrollment complete!"
echo ""
echo "  Test with: fprintd-verify $USER"
echo "  Then start Snow and the fingerprint gate will be active."
echo ""

# Quick verify test
echo "[*] Running a quick verification test..."
echo "    Place your finger on the sensor when ready..."
fprintd-verify "$USER" && echo "[✓] Verified successfully!" || echo "[✗] Verification failed — try re-enrolling."
