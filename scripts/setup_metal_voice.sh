#!/bin/bash
# S.N.O.W. Metal Mind - Phase 2 Voice Pipeline Setup (Ubuntu)
# This script installs Piper TTS and Whisper.cpp for zero-latency local voice.

set -e

echo "[SNOW METAL MIND] Starting Phase 2 Setup..."

# 1. Install dependencies
echo "[1/4] Installing system dependencies..."
sudo apt-get update
sudo apt-get install -y wget tar build-essential cmake

# Create data directories
mkdir -p data/piper_models
mkdir -p data/whisper

# 2. Install Piper TTS (x86_64 Linux)
echo "[2/4] Downloading Piper TTS..."
cd data
if ! command -v piper &> /dev/null && [ ! -f "$HOME/.local/bin/piper" ]; then
  wget -qO piper.tar.gz https://github.com/rhasspy/piper/releases/download/v1.2.0/piper_linux_x86_64.tar.gz
  tar -xf piper.tar.gz
  mkdir -p "$HOME/.local/bin"
  cp piper/piper "$HOME/.local/bin/piper"
  chmod +x "$HOME/.local/bin/piper"
  # Optional system-wide install if sudo is pre-authorized
  if sudo -n true 2>/dev/null; then
    sudo cp piper/piper /usr/local/bin/ 2>/dev/null || true
    sudo cp -r piper/espeak-ng-data /usr/local/share/ 2>/dev/null || true
  fi
  rm piper.tar.gz
  echo "Piper installed successfully to $HOME/.local/bin/piper"
else
  echo "Piper is already installed."
fi
cd ..

# 3. Download Piper Voice Model (en_US-lessac-medium)
echo "[3/4] Downloading Piper Neural Voice Model..."
cd data/piper_models
if [ ! -f "en_US-lessac-medium.onnx" ]; then
  wget -qO en_US-lessac-medium.onnx https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/en/en_US/lessac/medium/en_US-lessac-medium.onnx
  wget -qO en_US-lessac-medium.onnx.json https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/en/en_US/lessac/medium/en_US-lessac-medium.onnx.json
  echo "Voice model downloaded."
else
  echo "Voice model already exists."
fi
cd ../..

# 4. Install Whisper.cpp
echo "[4/4] Setting up Whisper.cpp (OpenVINO / CPU Optimized)..."
cd data/whisper
if [ ! -d "whisper.cpp" ]; then
  git clone https://github.com/ggerganov/whisper.cpp.git
  cd whisper.cpp
  bash ./models/download-ggml-model.sh tiny.en
  
  # Compile the whisper-server
  make server
  echo "Whisper server compiled."
else
  echo "Whisper.cpp already exists."
fi
cd ../..

echo ""
echo "=========================================================="
echo "Phase 2 Pipeline Setup Complete!"
echo "=========================================================="
echo "To run the local STT Whisper server in the background, run:"
echo "  ./data/whisper/whisper.cpp/server -m ./data/whisper/whisper.cpp/models/ggml-tiny.en.bin --port 8989 &"
echo ""
echo "S.N.O.W. is now fully disconnected from cloud voice APIs!"
