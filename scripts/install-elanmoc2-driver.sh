#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# SNOW AI — ELAN 04f3:0c00 Driver Installer
# Compiles and installs the community elanmoc2 driver for libfprint on Ubuntu.
# ─────────────────────────────────────────────────────────────────────────────
set -e

echo "╔════════════════════════════════════════════════════════════════════╗"
echo "║          SNOW AI — ELAN 04f3:0c00 DRIVER COMPILATION               ║"
echo "╚════════════════════════════════════════════════════════════════════╝"
echo ""
echo "[*] Step 1: Installing build dependencies..."
sudo apt-get update
sudo apt-get install -y \
  build-essential git meson ninja-build pkg-config \
  libglib2.0-dev libgusb-dev libnss3-dev libpixman-1-dev \
  libgudev-1.0-dev libgirepository1.0-dev libcairo2-dev \
  libssl-dev libsystemd-dev libudev-dev gobject-introspection

BUILD_DIR="/tmp/libfprint-elanmoc2"
rm -rf "$BUILD_DIR"

echo "[*] Step 2: Cloning elanmoc2 branch of libfprint..."
git clone --depth 1 -b elanmoc2 https://gitlab.freedesktop.org/depau/libfprint.git "$BUILD_DIR"

echo "[*] Step 3: Configuring build with meson..."
cd "$BUILD_DIR"
meson setup builddir -Ddoc=false --prefix=/usr

echo "[*] Step 4: Compiling libfprint..."
ninja -C builddir

echo "[*] Step 5: Installing driver to system..."
sudo ninja -C builddir install
sudo ldconfig

echo "[*] Step 6: Restarting fprintd service..."
sudo systemctl restart fprintd

echo ""
echo "[✓] Driver installation complete!"
echo "    Now run: bash '/home/snowjd/Documents/Snow Jarvis/scripts/enroll-fingerprint.sh'"
