"""Archive complete desktop applications, including hidden manifests and executable modes."""
import hashlib
import pathlib
import platform
import shutil
import sys

root = pathlib.Path(__file__).resolve().parents[1]
os_name = {'Darwin': 'macos', 'Windows': 'windows', 'Linux': 'linux'}[platform.system()]
output = root / 'artifacts'
output.mkdir(exist_ok=True)
for app in sys.argv[1:] or ['counter', 'universal']:
    build = root / 'examples' / app / 'dist' / 'desktop'
    directory = build / os_name
    if not directory.is_dir():
        raise SystemExit(f'Missing desktop build: {directory}')
    name = f'onestack-{app}-{os_name}-{platform.machine()}'
    shutil.make_archive(str(output / name), 'zip' if os_name == 'windows' else 'gztar', root_dir=directory)
    for extension in ('*.dmg', '*.deb', '*.msi', '*.AppImage'):
        for artifact in build.glob(extension):
            shutil.copy2(artifact, output / f'{app}-{artifact.name}')
files = sorted(path for path in output.iterdir() if path.is_file() and path.name != 'SHA256SUMS.txt')
(output / 'SHA256SUMS.txt').write_text(''.join(f'{hashlib.sha256(path.read_bytes()).hexdigest()}  {path.name}\n' for path in files))
