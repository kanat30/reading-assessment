import { ComprehensionQuestion } from "./scoring/types";

export interface Passage {
  id: string;
  title: string;
  grade_band: string;
  word_count: number;
  text: string;
  questions: ComprehensionQuestion[];
}

export const PASSAGES: Passage[] = [
  {
    id: "short-dog",
    title: "The Loyal Dog",
    grade_band: "4-6",
    word_count: 52,
    text: `Max was a golden retriever who loved his family. Every morning, he waited by the door until the children left for school. Then he would watch from the window until they returned. When the bus finally came, Max would bark with joy and spin in circles, his tail wagging like a happy flag.`,
    questions: [
      {
        id: "dog-1",
        question: "What kind of dog is Max?",
        type: "literal",
      },
      {
        id: "dog-2",
        question: "Where did Max wait to watch for the children?",
        type: "literal",
      },
      {
        id: "dog-3",
        question: "How do you know Max was excited when the children came home?",
        type: "inferential",
      },
    ],
  },
  {
    id: "short-space",
    title: "Journey to Mars",
    grade_band: "5-7",
    word_count: 58,
    text: `The rocket launched at dawn, carrying four astronauts toward Mars. Through the small window, Earth grew smaller until it looked like a blue marble. Captain Chen checked the instruments while her crew prepared for the long journey ahead. In six months, they would be the first humans to walk on the red planet.`,
    questions: [
      {
        id: "space-1",
        question: "How many astronauts were on the rocket?",
        type: "literal",
      },
      {
        id: "space-2",
        question: "How long would the journey to Mars take?",
        type: "literal",
      },
      {
        id: "space-3",
        question: "Why is this mission special or historic?",
        type: "inferential",
      },
    ],
  },
  {
    id: "short-ocean",
    title: "The Ocean Floor",
    grade_band: "5-7",
    word_count: 61,
    text: `Deep beneath the waves, the submarine descended into darkness. Dr. Patel switched on the lights, revealing a world few had ever seen. Strange fish with glowing bodies swam past the window. Colorful corals covered the rocks like an underwater garden. She smiled and began taking notes. This was why she became a marine biologist.`,
    questions: [
      {
        id: "ocean-1",
        question: "What is Dr. Patel's job?",
        type: "literal",
      },
      {
        id: "ocean-2",
        question: "What did Dr. Patel see when she turned on the lights?",
        type: "literal",
      },
      {
        id: "ocean-3",
        question: "Why do you think Dr. Patel smiled?",
        type: "inferential",
      },
    ],
  },
  {
    id: "atc-g6-01",
    title: "from The Adventures of Tom Sawyer",
    grade_band: "6-8",
    word_count: 117,
    text: `Saturday morning was come, and all the summer world was bright and fresh, and brimming with life. There was a song in every heart; and if the heart was young the music issued at the lips. There was cheer in every face and a spring in every step. The locust trees were in bloom and the fragrance of the blossoms filled the air. Cardiff Hill, beyond the village and above it, was green with vegetation, and it lay just far enough away to seem a Delectable Land, dreamy, reposeful, and inviting. Tom appeared on the sidewalk with a bucket of whitewash and a long-handled brush. He surveyed the fence, and all gladness left him and a deep melancholy settled down upon his spirit. Thirty yards of board fence nine feet high. Life to him seemed hollow, and existence but a burden.`,
    questions: [
      {
        id: "tom-1",
        question: "What was Tom carrying when he appeared on the sidewalk?",
        type: "literal",
      },
      {
        id: "tom-2",
        question: "How did the world around Tom feel at the beginning of the passage?",
        type: "literal",
      },
      {
        id: "tom-3",
        question: "Why did Tom's mood change when he saw the fence?",
        type: "inferential",
      },
    ],
  },
];

// Default to first (shortest) passage
export const PASSAGE = PASSAGES[0];
