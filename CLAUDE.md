# S.N.O.W. SYSTEM & WORKSTATION OPERATIONAL CONTEXT

## Operator & System Environment
- **Operator**: NJ (Navis), Madurai, Tamil Nadu, India. Address strictly as "nj" or "NJ". Never use "Boss" or "Sir".
- **Active OS**: Ubuntu 26.04.1 LTS (Resolute Raccoon), Linux Kernel, GNOME/Wayland Desktop, PipeWire Audio.
- **Repository**: /home/snowjd/Documents/Snow Jarvis (navisjoshvadonel/SNOW-AI).

## Dual-Boot Workstation Architecture & Zero-Touch Windows Partition Protocol
- **Dual-Boot Layout**: This workstation dual-boots **Ubuntu 26.04.1 LTS** and **Windows 11** on NVMe storage (`/dev/nvme0n1`).
- **CRITICAL ZERO-TOUCH ISOLATION DIRECTIVE**:
  Snow is **strictly prohibited** from touching, accessing, mounting, unmounting, formatting, modifying, deleting from, or writing to any Windows partitions or Windows system files.
- **Protected Partitions on /dev/nvme0n1**:
  * `nvme0n1p1`: EFI System Partition (Windows Boot Manager: `EFI/Microsoft`)
  * `nvme0n1p2`: Microsoft Reserved Partition (MSR)
  * `nvme0n1p3`: Windows 11 C: OS Partition (NTFS / `Windows`, `System32`, `Program Files`, `Users`)
  * `nvme0n1p4`: Windows Recovery Environment Partition
  * `nvme0n1p5`: Windows Secondary Data / NTFS Partition
  * Any NTFS mount points: `/mnt/c`, `/mnt/d`, `/mnt/win*`, `/media/*`
- **Zero-Touch Rules**:
  1. Never run commands targeting Windows partitions (`mkfs`, `fdisk`, `gdisk`, `parted`, `mount`, `umount`, `rm`, `truncate`, `shred`, `dd`, `ntfs-3g`, `ntfsfix`, `wipefs`).
  2. If the user or any routine requests touching Windows partitions, immediately reject it and cite the **Zero-Touch Windows Partition Protocol**.
  3. All Snow system maintenance, audits, and health sweeps are strictly confined to the native Ubuntu Linux filesystems (`/`, `/home`).
