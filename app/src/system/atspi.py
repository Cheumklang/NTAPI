#!/usr/bin/env python3
"""
AT-SPI2 bridge — the Linux half of "the agent can see the desktop".

Why a helper process instead of a native module: the accessibility tree only
exists on the session's a11y bus, and the boring, well-tested way to reach it
from Node is to hand one JSON job to python3-gi and read one JSON answer back.
It also keeps the risky part (D-Bus calls into other applications) out of the
Electron process: a hung app can only hang this script, and the caller kills it.

Commands (one per run, JSON on stdout, exit code 0 only on {"ok": true}):

  probe                     is there an accessibility bus, and how many apps?
  windows                   top-level applications and their frames
  snapshot --app N [--max K]  the tree of one application, with refs
  act --ref A/B/C --action click|settext [--text T]

Refs are child-index paths from the desktop root ("3/0/2" = app 3, frame 0,
child 2). They are as short-lived as the tree they came from, which is why the
caller always snapshots again after acting.

Run by hand to debug:  python3 atspi.py probe
"""
import argparse
import json
import sys

MAX_DEPTH = 14


def emit(payload):
    json.dump(payload, sys.stdout, ensure_ascii=False)
    sys.stdout.write('\n')
    sys.stdout.flush()


def fail(message, code='ERROR'):
    emit({'ok': False, 'code': code, 'error': str(message)})
    sys.exit(1)


def load_atspi():
    try:
        import gi
    except Exception as exc:  # python3-gi not installed
        fail('python3-gi is missing: %s' % exc, 'NO_GI')
    try:
        gi.require_version('Atspi', '2.0')
        from gi.repository import Atspi
        return Atspi
    except Exception as exc:
        fail('AT-SPI bindings are missing: %s' % exc, 'NO_ATSPI')


def safe(call, default=None):
    """Every property of another application's tree can raise or hang."""
    try:
        return call()
    except Exception:
        return default


def role_of(node):
    return safe(lambda: node.get_role_name(), 'unknown') or 'unknown'


def name_of(node):
    return safe(lambda: node.get_name(), '') or ''


def children_of(node):
    n = safe(lambda: node.get_child_count(), 0) or 0
    out = []
    for i in range(n):
        child = safe(lambda i=i: node.get_child_at_index(i))
        if child is not None:
            out.append(child)
    return out


def actions_of(node):
    iface = safe(lambda: node.get_action_iface())
    if iface is None:
        return []
    n = safe(lambda: iface.get_n_actions(), 0) or 0
    names = []
    for i in range(n):
        label = safe(lambda i=i: iface.get_action_name(i), '')
        # GTK publishes whole menus as action names on frames (`view.zoom-in`,
        # `slot.up`). They are not buttons a reader would pick, and printing them
        # buries the real controls, so the snapshot keeps the plain ones.
        if label and '.' not in label:
            names.append(label)
    return names[:6]


def editable(node):
    iface = safe(lambda: node.get_editable_text_iface())
    return iface is not None


def desktop(Atspi):
    desk = safe(lambda: Atspi.get_desktop(0))
    if desk is None:
        fail('no accessibility desktop; is AT-SPI running?', 'NO_DESKTOP')
    return desk


def cmd_probe(Atspi, _args):
    desk = desktop(Atspi)
    apps = []
    for i, app in enumerate(children_of(desk)):
        apps.append({'index': i, 'name': name_of(app), 'role': role_of(app), 'frames': len(children_of(app))})
    emit({'ok': True, 'apps': apps})


def cmd_windows(Atspi, _args):
    desk = desktop(Atspi)
    windows = []
    for i, app in enumerate(children_of(desk)):
        app_name = name_of(app)
        for j, frame in enumerate(children_of(app)):
            windows.append({
                'app': i,
                'frame': j,
                'appName': app_name,
                'title': name_of(frame),
                'role': role_of(frame),
            })
    emit({'ok': True, 'windows': windows})


def cmd_snapshot(Atspi, args):
    desk = desktop(Atspi)
    apps = children_of(desk)
    if args.app < 0 or args.app >= len(apps):
        fail('no application %d; run `windows` first' % args.app, 'NO_APP')
    root = apps[args.app]
    limit = max(1, min(args.max, 800))
    nodes = []
    # Depth-first: a reader opening one branch and finishing it is how a person
    # describes a window; breadth-first answers with every empty wrapper at once
    # and only reaches the first button when the budget is nearly gone.
    queue = [(root, str(args.app), 0)]
    while queue and len(nodes) < limit:
        node, ref, depth = queue.pop()
        node_actions = actions_of(node)
        entry = {'ref': ref, 'role': role_of(node), 'name': name_of(node)}
        if node_actions:
            entry['actions'] = node_actions
        if editable(node):
            entry['editable'] = True
        children = children_of(node)
        # A wrapper holding a single unnamed child is layout, not content
        # (Nautilus builds four nested panes before the first button). Printing
        # them costs a line each and hides the controls the agent came for.
        if not node_actions and not entry.get('editable') and not entry['name'] and len(children) == 1:
            queue.insert(0, (children[0], '%s/0' % ref, depth + 1))
            continue
        nodes.append(entry)
        if depth >= MAX_DEPTH:
            continue
        for idx in range(len(children) - 1, -1, -1):
            queue.append((children[idx], '%s/%d' % (ref, idx), depth + 1))
    emit({'ok': True, 'app': args.app, 'appName': name_of(root), 'nodes': nodes, 'total': len(nodes)})


def resolve(desk, ref):
    parts = [p for p in str(ref).split('/') if p != '']
    if not parts:
        fail('empty ref', 'BAD_ARGS')
    node = desk
    for part in parts:
        try:
            idx = int(part)
        except ValueError:
            fail('ref must be slash-separated numbers', 'BAD_ARGS')
        node = safe(lambda idx=idx: node.get_child_at_index(idx))
        if node is None:
            fail('that ref is gone; snapshot again', 'STALE_REF')
    return node


def cmd_act(Atspi, args):
    desk = desktop(Atspi)
    node = resolve(desk, args.ref)
    if args.action == 'click':
        iface = safe(lambda: node.get_action_iface())
        if iface is None:
            fail('that element has no action; pick a row with "click"', 'NO_ACTION')
        count = safe(lambda: iface.get_n_actions(), 0) or 0
        if count == 0:
            fail('that element has no action', 'NO_ACTION')
        wanted = (args.text or '').strip().lower()
        # A frame with sixty actions is a menu bar, not a button: without a name
        # the first action is an arbitrary command, which is exactly the kind of
        # "it clicked something" nobody can undo.
        if count > 8 and not wanted:
            fail('that element has %d actions; name the one to use in --text' % count, 'AMBIGUOUS_ACTION')
        index = 0
        for i in range(count):
            label = (safe(lambda i=i: iface.get_action_name(i), '') or '').lower()
            if wanted and label == wanted:
                index = i
                break
        ok = safe(lambda: iface.do_action(index), False)
        if not ok:
            fail('the application refused the action', 'REFUSED')
        emit({'ok': True, 'did': 'click', 'ref': args.ref})
        return
    if args.action == 'settext':
        text = args.text if args.text is not None else ''
        did = safe(lambda: node.set_text_contents(text), None)
        if did is None:
            iface = safe(lambda: node.get_editable_text_iface())
            if iface is None:
                fail('that element is not editable', 'NOT_EDITABLE')
            did = safe(lambda: iface.set_text_contents(text), None)
        if did is None:
            fail('the application refused the text', 'REFUSED')
        emit({'ok': True, 'did': 'settext', 'ref': args.ref})
        return
    fail('unknown action %r' % args.action, 'BAD_ARGS')


def main():
    parser = argparse.ArgumentParser(add_help=True)
    parser.add_argument('command', choices=['probe', 'windows', 'snapshot', 'act'])
    parser.add_argument('--app', type=int, default=0)
    parser.add_argument('--max', type=int, default=250)
    parser.add_argument('--ref', default='')
    parser.add_argument('--action', default='click')
    parser.add_argument('--text', default=None)
    args = parser.parse_args()

    Atspi = load_atspi()
    try:
        if args.command == 'probe':
            cmd_probe(Atspi, args)
        elif args.command == 'windows':
            cmd_windows(Atspi, args)
        elif args.command == 'snapshot':
            cmd_snapshot(Atspi, args)
        else:
            cmd_act(Atspi, args)
    except SystemExit:
        raise
    except Exception as exc:
        fail(exc)


if __name__ == '__main__':
    main()
