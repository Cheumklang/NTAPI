#!/usr/bin/env python3
"""
Whole-screen capture through the desktop portal — the only way on Wayland.

GNOME refuses the shell's own screenshot service to any other program
("org.gnome.Shell.Screenshot: AccessDenied"), and XWayland has no picture of a
Wayland desktop, so `import -window root` comes back empty. What is left is
`org.freedesktop.portal.Screenshot`, the interface the compositor advertises for
exactly this: it may show the user a permission dialog, and the answer comes back
on an `org.freedesktop.portal.Request` signal, not as a return value.

Prints one JSON object on stdout:

  {"ok": true, "width": W, "height": H, "data": "<base64 png>"}
  {"ok": false, "code": "DENIED", "error": "..."}

Run by hand to debug:  python3 portal-shot.py
"""
import base64
import json
import os
import sys
import time

PORTAL = 'org.freedesktop.portal.Desktop'
PORTAL_PATH = '/org/freedesktop/portal/desktop'
# A permission dialog is waiting for the user here, so the budget is generous:
# anything shorter turns "still deciding" into a failure they cannot explain.
ANSWER_SECONDS = 45


def fail(code, message):
    print(json.dumps({'ok': False, 'code': code, 'error': message}))
    sys.exit(1)


def main():
    try:
        import gi
        gi.require_version('Gio', '2.0')
        from gi.repository import Gio, GLib
    except Exception as err:  # noqa: BLE001 - any import failure means "no portal"
        fail('NO_PORTAL', 'python3-gi is not available: %s' % err)

    try:
        bus = Gio.bus_get_sync(Gio.BusType.SESSION, None)
    except Exception as err:  # noqa: BLE001
        fail('NO_BUS', 'no session bus: %s' % err)

    token = 'ntapi%d' % os.getpid()
    # The signal lives on the request handle the portal derives from our unique
    # name and the token — subscribing to the portal path instead silently lost
    # every answer (measured: 20 s of nothing, then a timeout that looked like a
    # refusal).
    unique = (bus.get_unique_name() or '').lstrip(':').replace('.', '_')
    handle = '%s/request/%s/%s' % (PORTAL_PATH, unique, token)

    loop = GLib.MainLoop()
    answer = {}

    def on_response(_conn, _sender, _path, _iface, _signal, params, *_rest):
        code, results = params.unpack()
        answer['code'] = code
        answer['results'] = results
        loop.quit()

    bus.signal_subscribe(
        PORTAL, 'org.freedesktop.portal.Request', 'Response', handle, None,
        Gio.DBusSignalFlags.NONE, on_response,
    )

    options = {
        'handle_token': GLib.Variant('s', token),
        'interactive': GLib.Variant('b', False),
    }
    try:
        bus.call_sync(
            PORTAL, PORTAL_PATH, 'org.freedesktop.portal.Screenshot', 'Screenshot',
            GLib.Variant('(sa{sv})', ('', options)), None,
            Gio.DBusCallFlags.NONE, 10000, None,
        )
    except GLib.Error as err:
        fail('NO_PORTAL', 'the desktop portal refused the call: %s' % err.message)

    def give_up():
        loop.quit()
        return False

    started = time.time()
    GLib.timeout_add(int(ANSWER_SECONDS * 1000), give_up)
    loop.run()

    if 'code' not in answer:
        fail('TIMEOUT', 'the portal did not answer within %ds (the permission dialog is still open?)' % ANSWER_SECONDS)
    if answer['code'] == 1:
        fail('DENIED', 'the user cancelled the screen capture')
    if answer['code'] == 2:
        fail('DENIED', 'the desktop refused the screen capture')
    uri = str((answer.get('results') or {}).get('uri') or '')
    if not uri.startswith('file://'):
        fail('NO_IMAGE', 'the portal answered without a picture (%s)' % (uri or 'no uri'))
    path = uri[len('file://'):]
    try:
        with open(path, 'rb') as fh:
            data = fh.read()
    except OSError as err:
        fail('NO_IMAGE', 'the portal saved a picture that cannot be read: %s' % err)

    width, height = 0, 0
    try:
        # PNG: 16-byte signature + IHDR width/height, big endian.
        width = int.from_bytes(data[16:20], 'big')
        height = int.from_bytes(data[20:24], 'big')
    except Exception:  # noqa: BLE001 - a size we cannot read is not a failure
        pass
    print(json.dumps({
        'ok': True,
        'took': round(time.time() - started, 2),
        'width': width,
        'height': height,
        'data': base64.b64encode(data).decode('ascii'),
    }))


if __name__ == '__main__':
    main()
