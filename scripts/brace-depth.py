with open('scripts/verify-prototype-visuals.mjs') as f:
    src = f.read()
lines = src.split('\n')
depth = 0
isin = None
inback = False
BS = '\\'
for i, line in enumerate(lines, 1):
    j = 0
    while j < len(line):
        c = line[j]
        if inback:
            if c == '`' and (j == 0 or line[j-1] != BS):
                inback = False
        elif isin:
            if c == isin and (j == 0 or line[j-1] != BS):
                isin = None
        else:
            if c == '`':
                inback = True
            elif c in ('"', "'"):
                isin = c
            elif c == '{':
                depth += 1
            elif c == '}':
                depth -= 1
        j += 1
print('FINAL depth:', depth, '| line count:', len(lines))
for i, line in enumerate(lines[:35], 1):
    j = 0
    while j < len(line):
        c = line[j]
        if inback:
            if c == '`' and (j == 0 or line[j-1] != BS):
                inback = False
        elif isin:
            if c == isin and (j == 0 or line[j-1] != BS):
                isin = None
        else:
            if c == '`':
                inback = True
            elif c in ('"', "'"):
                isin = c
            elif c == '{':
                depth += 1
            elif c == '}':
                depth -= 1
        j += 1
    if i <= 35:
        print(f'{i:>3} depth={depth}  {line.rstrip()[:80]}')
