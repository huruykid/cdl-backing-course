#!/bin/sh
# Joins src/ into the single-file game, index.html.
cd "$(dirname "$0")"
python3 - <<'PY'
head = open('src/head.html').read()
js = open('src/core.js').read() + open('src/sound.js').read() + open('src/ui.js').read()
i = head.index('</style>') + 8
top = head[:i].replace('<style>', '<style>\nhtml{color-scheme:dark}body{margin:0}img{max-width:100%}[hidden]{display:none!important}\n', 1)
three = '<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>\n'
page = ('<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n'
        '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
        + top + '\n</head>\n<body>' + head[i:] + three + '<script>\n(function () {\n' + js + '})();\n</script>\n</body>\n</html>\n')
open('index.html', 'w').write(page)
PY
