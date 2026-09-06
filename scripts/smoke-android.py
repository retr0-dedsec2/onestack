"""Verify real native views and a bridge-driven route transition on a booted emulator."""
import re
import subprocess
import time
import xml.etree.ElementTree as ET

def ui():
    subprocess.run(['adb', 'shell', 'uiautomator', 'dump', '/sdcard/window.xml'], check=True, stdout=subprocess.DEVNULL)
    return subprocess.check_output(['adb', 'shell', 'cat', '/sdcard/window.xml']).decode()

markup = ui()
assert 'OneStack Universal' in markup, 'Native app title is missing'
button = next(node for node in ET.fromstring(markup).iter('node') if node.get('text', '').casefold() == 'billing')
left, top, right, bottom = map(int, re.findall(r'\d+', button.get('bounds')))
subprocess.run(['adb', 'shell', 'input', 'tap', str((left+right)//2), str((top+bottom)//2)], check=True)
time.sleep(2)
assert 'Checkout requires' in ui(), 'Native route did not change after Billing tap'
print('Native Android title and route transition verified')
