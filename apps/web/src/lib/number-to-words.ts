/**
 * English number-to-words for "In Words Birr" on tax invoices.
 *
 * Supports values up to 999,999,999,999.99. Splits into birr + cents and
 * pluralises naturally ("one birr and fifty cents", "six hundred ninety-eight
 * thousand fifty birr").
 */

const ONES = [
  "zero",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
  "eleven",
  "twelve",
  "thirteen",
  "fourteen",
  "fifteen",
  "sixteen",
  "seventeen",
  "eighteen",
  "nineteen",
];

const TENS = [
  "",
  "",
  "twenty",
  "thirty",
  "forty",
  "fifty",
  "sixty",
  "seventy",
  "eighty",
  "ninety",
];

const SCALES = ["", "thousand", "million", "billion"];

function chunkToWords(n: number): string {
  const parts: string[] = [];
  const hundreds = Math.floor(n / 100);
  const remainder = n % 100;
  if (hundreds > 0) parts.push(`${ONES[hundreds]} hundred`);
  if (remainder > 0) {
    if (remainder < 20) {
      parts.push(ONES[remainder]);
    } else {
      const t = Math.floor(remainder / 10);
      const o = remainder % 10;
      parts.push(o ? `${TENS[t]}-${ONES[o]}` : TENS[t]);
    }
  }
  return parts.join(" ");
}

function intToWords(n: number): string {
  if (n === 0) return "zero";
  const chunks: string[] = [];
  let scale = 0;
  let remaining = n;
  while (remaining > 0) {
    const chunk = remaining % 1000;
    if (chunk > 0) {
      const words = chunkToWords(chunk);
      chunks.unshift(SCALES[scale] ? `${words} ${SCALES[scale]}` : words);
    }
    remaining = Math.floor(remaining / 1000);
    scale += 1;
  }
  return chunks.join(" ");
}

function capitaliseFirst(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Format an amount as "Six hundred ninety-eight thousand fifty birr" or
 * "One hundred birr and fifty cents".
 */
export function amountInWords(amount: number, currency = "birr"): string {
  if (!Number.isFinite(amount)) return "";
  const sign = amount < 0 ? "Negative " : "";
  const abs = Math.abs(amount);
  const birr = Math.floor(abs);
  const cents = Math.round((abs - birr) * 100);

  const birrWords = `${intToWords(birr)} ${currency}`;
  const result =
    cents > 0
      ? `${birrWords} and ${intToWords(cents)} cents`
      : birrWords;

  return `${sign}${capitaliseFirst(result)}`;
}
