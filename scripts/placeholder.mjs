// Placeholder for scripts that a later build step implements. Exits 0 so `pnpm verify` runs.
const [name, word, n] = process.argv.slice(2);
console.log(`[${name}] not implemented yet (arrives in ${word} ${n}).`);
