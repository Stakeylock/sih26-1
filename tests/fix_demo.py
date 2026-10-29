content = open('D:/sc/repo/sih26-1/src/data/demo.ts', 'r').read()
lines = content.split('\n')
lines[524] = "      const bySeatEntries:[EVCSeat,number][] = EVC_REQUIRED_SEATS.map(s=>[s,cands.get(s)!.length]);"
lines[525] = "      const bySeat:Record<EVCSeat,number> = Object.fromEntries(bySeatEntries) as Record<EVCSeat,number>;"
lines[526] = "      const renewalMessage = satisfiable ? null : 'No eligible EVC committee members are available for the selected date and time. Please choose another date or time.';"
lines[527] = "      return {observations, capacity: bySeat, message: renewalMessage, bufferMinutes: 15} as EVCAvailabilityResult;"
content = '\n'.join(lines)
open('D:/sc/repo/sih26-1/src/data/demo.ts', 'w').write(content)
print('Done')
print(lines[524])
print(lines[525])
print(lines[526])
print(lines[527])