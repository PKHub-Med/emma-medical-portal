const LOWERCASE = 'abcdefghijkmnopqrstuvwxyz';
const UPPERCASE = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const DIGITS = '23456789';
const SPECIAL = '!@#$%^&*_-+=';
const ALL_CHARACTERS = LOWERCASE + UPPERCASE + DIGITS + SPECIAL;
const PASSWORD_LENGTH = 20;

export function generateTemporaryPassword(): string {
  const characters = [
    randomCharacter(LOWERCASE),
    randomCharacter(UPPERCASE),
    randomCharacter(DIGITS),
    randomCharacter(SPECIAL),
  ];

  while (characters.length < PASSWORD_LENGTH) {
    characters.push(randomCharacter(ALL_CHARACTERS));
  }

  for (let index = characters.length - 1; index > 0; index -= 1) {
    const swapIndex = randomIndex(index + 1);
    [characters[index], characters[swapIndex]] = [
      characters[swapIndex],
      characters[index],
    ];
  }

  return characters.join('');
}

function randomCharacter(characters: string): string {
  return characters[randomIndex(characters.length)]!;
}

function randomIndex(maximum: number): number {
  const value = new Uint32Array(1);
  const range = 0x1_0000_0000;
  const limit = Math.floor(range / maximum) * maximum;

  do {
    window.crypto.getRandomValues(value);
  } while (value[0]! >= limit);

  return value[0]! % maximum;
}
