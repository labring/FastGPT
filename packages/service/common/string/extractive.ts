import { addLog } from '../system/log';
import { stopWords } from './jieba/index';

type ScoredSentence = {
  sentence: string;
  score: number;
  position: number; // sentence position in document
  keywordMatches: number; // mathches times of keywords in sentence
};

export type ExtractiveTextParams = {
  text: string;
  keyword: string;
  maxLength?: number; // default 200
  minLength?: number; // default 50
};

const BM25_K1 = 1.5; // word frequency scaling factor
const BM25_B = 0.75; // length normalization factor

export const extractiveText = ({
  text,
  keyword,
  maxLength = 200,
  minLength = 50
}: ExtractiveTextParams): string => {
  const cleanedText = text.trim();

  if (cleanedText.length <= minLength) {
    return cleanedText;
  }

  const keywords = splitKeywords(keyword.toLowerCase());
  if (keywords.length === 0) {
    return truncateText(cleanedText, maxLength);
  }

  const sentences = splitSentences(cleanedText);
  if (sentences.length === 0) {
    return truncateText(cleanedText, maxLength);
  }

  const scoredSentences = sentences.map((sentence, index) =>
    scoreSentence(sentence, index, keywords, sentences)
  );

  const sortedSentences = scoredSentences
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score);

  if (sortedSentences.length === 0) {
    return truncateText(cleanedText, maxLength);
  }

  const extractedText = buildExtractionWindow(sortedSentences, sentences, maxLength);
  addLog.debug(`Extracted Text: ${extractedText}`);
  return extractedText;
};

const splitKeywords = (keyword: string): string[] => {
  // remove unused charactor
  const cleaned = keyword.replace(/[^\u4e00-\u9fa5a-z0-9\s]/gi, ' ');

  const words = cleaned
    .split(/\s+/)
    .filter((w) => w.length > 0)
    .map((w) => w.toLowerCase())
    .filter((w) => !stopWords.has(w));

  return words;
};

const splitSentences = (text: string): string[] => {
  const sentenceRegex = /([^。！？；.!?;\n]+[。！？；.!?;\n]?)/g;
  const matches = text.match(sentenceRegex);

  if (!matches) return [text];

  return matches.map((s) => s.trim()).filter((s) => s.length > 0);
};

/**
 * IDF(q) = ln((N - n(q) + 0.5) / (n(q) + 0.5) + 1)
 *
 */
const calculateIDF = (keyword: string, allSentences: string[], sentenceCount: number): number => {
  let docFreq = 0;
  for (const sentence of allSentences) {
    if (sentence.toLowerCase().includes(keyword.toLowerCase())) {
      docFreq++;
    }
  }

  // IDF：ln((N - df + 0.5) / (df + 0.5) + 1)
  // add smoothing to avoid division by zero
  const idf = Math.log((sentenceCount - docFreq + 0.5) / (docFreq + 0.5) + 1);

  return Math.max(idf, 0.1); // avoid zero or negative IDF
};

/**
 * calculate term frequency of keyword in sentence
 */
const calculateTermFrequency = (keyword: string, sentence: string): number => {
  const lowerSentence = sentence.toLowerCase();
  const lowerKeyword = keyword.toLowerCase();
  const regex = new RegExp(escapeRegExp(lowerKeyword), 'gi');
  const matches = lowerSentence.match(regex);
  return matches ? matches.length : 0;
};

/**
 * BM25(D, Q) = Σ IDF(qi) * (f(qi, D) * (k1 + 1)) / (f(qi, D) + k1 * (1 - b + b * |D| / avgdl))
 */
const scoreSentence = (
  sentence: string,
  position: number,
  keywords: string[],
  allSentences: string[]
): ScoredSentence => {
  const sentenceLength = sentence.length;
  const sentenceCount = allSentences.length;

  const avgDocLength = allSentences.reduce((sum, s) => sum + s.length, 0) / sentenceCount;

  let bm25Score = 0;
  let totalMatches = 0;

  for (const keyword of keywords) {
    const tf = calculateTermFrequency(keyword, sentence);
    if (tf === 0) continue;

    totalMatches += tf;

    const idf = calculateIDF(keyword, allSentences, sentenceCount);

    const numerator = tf * (BM25_K1 + 1);
    const denominator = tf + BM25_K1 * (1 - BM25_B + (BM25_B * sentenceLength) / avgDocLength);

    bm25Score += idf * (numerator / denominator);
  }

  // add position-based boost (earlier sentences get slight boost)
  const positionBoost = 1.0 - (position / sentenceCount) * 0.1;
  const finalScore = bm25Score * positionBoost;

  return {
    sentence,
    score: finalScore,
    position,
    keywordMatches: totalMatches
  };
};

/**
 * returns escaped string for use in RegExp
 */
const escapeRegExp = (str: string): string => {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

// try to build extraction window around highest scored sentence
const buildExtractionWindow = (
  scoredSentences: ScoredSentence[],
  allSentences: string[],
  maxLength: number
): string => {
  if (scoredSentences.length === 0) return '';

  const bestSentence = scoredSentences[0];
  const centerPosition = bestSentence.position;

  if (bestSentence.sentence.length >= maxLength) {
    return truncateText(bestSentence.sentence, maxLength);
  }

  let windowText = bestSentence.sentence;
  let currentLength = windowText.length;

  let left = centerPosition - 1;
  let right = centerPosition + 1;

  while (currentLength < maxLength && (left >= 0 || right < allSentences.length)) {
    let added = false;

    while (left >= 0) {
      const leftSentence = allSentences[left];
      if (currentLength + leftSentence.length <= maxLength) {
        windowText = leftSentence + windowText;
        currentLength += leftSentence.length;
        added = true;
      } else {
        added = false;
        break;
      }
      left--;
    }

    while (right < allSentences.length) {
      const rightSentence = allSentences[right];
      if (currentLength + rightSentence.length <= maxLength) {
        windowText = windowText + rightSentence;
        currentLength += rightSentence.length;
        added = true;
      } else {
        added = false;
        break;
      }
      right++;
    }

    if (!added) {
      break;
    }
  }

  return windowText.trim();
};

const truncateText = (text: string, maxLength: number): string => {
  if (text.length <= maxLength) return text;

  return text.slice(0, maxLength) + '...';
};
