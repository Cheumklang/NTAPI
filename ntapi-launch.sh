#!/usr/bin/env bash
# NTAPI — Linux launcher
# เปิดแบบผู้ใช้ปกติทันที ไม่ถามสิทธิ์ (ทางลัด/เมนูแอปกดแล้วเข้าได้เลย)
# ใช้ NTAPI_MODE=root เมื่อต้องการเปิดด้วยสิทธิ์ผู้ดูแลระบบ (ไม่ถาม)

set -u

APP="/home/nt/NT-ALL/NTAPI/app"
ELECTRON="$APP/node_modules/electron/dist/electron"

if [ ! -x "$ELECTRON" ]; then
  zenity --error --title="NTAPI" --text="ไม่พบ Electron ที่\n$ELECTRON" 2>/dev/null
  echo "missing electron: $ELECTRON" >&2
  exit 1
fi

mode="${NTAPI_MODE:-normal}"

case "$mode" in
  normal)
    exec "$ELECTRON" --no-sandbox --password-store=basic "$APP"
    ;;
  root)
    # pkexec ล้าง environment ทิ้ง จึงต้องหาที่ทางไป session ของผู้ใช้เอง
    run_dir="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}"
    wl="${WAYLAND_DISPLAY:-}"
    [ -z "$wl" ] && wl="$(cd "$run_dir" 2>/dev/null && ls wayland-[0-9]* 2>/dev/null | head -1)"
    xauth="${XAUTHORITY:-}"
    if [ -z "$xauth" ] || [ ! -r "$xauth" ]; then
      xauth="$(ls "$run_dir"/.mutter-Xwaylandauth.* 2>/dev/null | head -1)"
    fi

    # แชท/ประวัติ/prefs อยู่ที่ data root -> ชี้ไปชุดเดียวกับโหมดปกติ
    # ส่วนโปรไฟล์ Chromium แยกไว้ที่ /root เพื่อไม่ให้ชน single-instance lock
    # และเมื่อแอปปิด ให้คืน ownership ไฟล์ที่ root เขียน ให้ nt ใช้ต่อได้
    exec pkexec env \
      DISPLAY="${DISPLAY:-:0}" \
      XAUTHORITY="$xauth" \
      XDG_RUNTIME_DIR="$run_dir" \
      WAYLAND_DISPLAY="$wl" \
      NTAPI_DATA_DIR=/home/nt/.local/share/ntapi \
      /bin/sh -c '
        chown -R nt:nt /home/nt/.local/share/ntapi 2>/dev/null
        HOME=/home/nt; export HOME
        "$1" --no-sandbox --password-store=basic --user-data-dir=/root/.config/FreePi ${3:+--ozone-platform=wayland} "$2"
        rc=$?
        chown -R nt:nt /home/nt/.local/share/ntapi 2>/dev/null || echo "NTAPI: chown data root failed" >&2
        exit $rc
      ' sh "$ELECTRON" "$APP" "$wl"
    ;;
  *)
    echo "unknown mode: $mode" >&2
    exit 2
    ;;
esac
