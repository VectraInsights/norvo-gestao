import pathlib
lines = pathlib.Path('HISTORICO.md').read_text(encoding='utf-8').splitlines()
for i in range(5366, len(lines)):
    print(str(i+1) + ': ' + lines[i][:170])
