import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import { resolve } from "path";

// Load env from .env.local
dotenv.config({ path: resolve(__dirname, "../.env.local") });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("Missing Supabase environment variables");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

interface Question {
  question: string;
  type: "literal" | "inferential";
}

interface PassageData {
  title: string;
  text: string;
  grade_band: string;
  word_count: number;
  source_attribution: string;
  questions: Question[];
}

// Passages with comprehension questions
// Mix of fiction and nonfiction, 50-200 words each
const passages: PassageData[] = [
  {
    title: "The Loyal Dog",
    text: `Max was a golden retriever who loved his family. Every morning, he waited by the door until the children left for school. Then he would watch from the window until they returned. When the bus finally came, Max would bark with joy and spin in circles, his tail wagging like a happy flag.`,
    grade_band: "4-6",
    word_count: 52,
    source_attribution: "Original composition",
    questions: [
      { question: "What kind of dog is Max?", type: "literal" },
      { question: "Where did Max wait to watch for the children?", type: "literal" },
      { question: "How do you know Max was excited when the children came home?", type: "inferential" },
    ],
  },
  {
    title: "Journey to Mars",
    text: `The rocket launched at dawn, carrying four astronauts toward Mars. Through the small window, Earth grew smaller until it looked like a blue marble. Captain Chen checked the instruments while her crew prepared for the long journey ahead. In six months, they would be the first humans to walk on the red planet.`,
    grade_band: "5-7",
    word_count: 58,
    source_attribution: "Original composition",
    questions: [
      { question: "How many astronauts were on the rocket?", type: "literal" },
      { question: "How long would the journey to Mars take?", type: "literal" },
      { question: "Why is this mission special or historic?", type: "inferential" },
    ],
  },
  {
    title: "The Ocean Floor",
    text: `Deep beneath the waves, the submarine descended into darkness. Dr. Patel switched on the lights, revealing a world few had ever seen. Strange fish with glowing bodies swam past the window. Colorful corals covered the rocks like an underwater garden. She smiled and began taking notes. This was why she became a marine biologist.`,
    grade_band: "5-7",
    word_count: 61,
    source_attribution: "Original composition",
    questions: [
      { question: "What is Dr. Patel's job?", type: "literal" },
      { question: "What did Dr. Patel see when she turned on the lights?", type: "literal" },
      { question: "Why do you think Dr. Patel smiled?", type: "inferential" },
    ],
  },
  {
    title: "from The Adventures of Tom Sawyer",
    text: `Saturday morning was come, and all the summer world was bright and fresh, and brimming with life. There was a song in every heart; and if the heart was young the music issued at the lips. There was cheer in every face and a spring in every step. The locust trees were in bloom and the fragrance of the blossoms filled the air. Cardiff Hill, beyond the village and above it, was green with vegetation, and it lay just far enough away to seem a Delectable Land, dreamy, reposeful, and inviting. Tom appeared on the sidewalk with a bucket of whitewash and a long-handled brush. He surveyed the fence, and all gladness left him and a deep melancholy settled down upon his spirit. Thirty yards of board fence nine feet high. Life to him seemed hollow, and existence but a burden.`,
    grade_band: "6-8",
    word_count: 150,
    source_attribution: "Mark Twain, The Adventures of Tom Sawyer (1876), public domain",
    questions: [
      { question: "What was Tom carrying when he appeared on the sidewalk?", type: "literal" },
      { question: "How did the world around Tom feel at the beginning of the passage?", type: "literal" },
      { question: "Why did Tom's mood change when he saw the fence?", type: "inferential" },
    ],
  },
  {
    title: "from The Time Machine",
    text: `The Time Traveller (for so it will be convenient to speak of him) was expounding a recondite matter to us. His grey eyes shone and twinkled, and his usually pale face was flushed and animated. The fire burned brightly, and the soft radiance of the incandescent lights in the lilies of silver caught the bubbles that flashed and passed in our glasses. Our chairs, being his patents, embraced and caressed us rather than submitted to be sat upon, and there was that luxurious after-dinner atmosphere when thought roams gracefully free of the trammels of precision.`,
    grade_band: "6-8",
    word_count: 96,
    source_attribution: "H.G. Wells, The Time Machine (1895), public domain",
    questions: [
      { question: "What color were the Time Traveller's eyes?", type: "literal" },
      { question: "What was special about the chairs?", type: "literal" },
      { question: "What kind of mood or atmosphere does the scene describe?", type: "inferential" },
    ],
  },
  {
    title: "from Narrative of the Life of Frederick Douglass",
    text: `I lived in Master Hugh's family about seven years. During this time, I succeeded in learning to read and write. In accomplishing this, I was compelled to resort to various stratagems. I had no regular teacher. My mistress, who had kindly commenced to instruct me, had, in compliance with the advice and direction of her husband, not only ceased to instruct, but had set her face against my being instructed by any one else. The plan which I adopted, and the one by which I was most successful, was that of making friends of all the little white boys whom I met in the street.`,
    grade_band: "6-8",
    word_count: 107,
    source_attribution: "Frederick Douglass, Narrative of the Life of Frederick Douglass (1845), public domain",
    questions: [
      { question: "How long did the author live with Master Hugh's family?", type: "literal" },
      { question: "Who first started teaching the author to read?", type: "literal" },
      { question: "Why did the author need to use 'stratagems' to learn to read?", type: "inferential" },
    ],
  },
  {
    title: "The Declaration of Independence (excerpt)",
    text: `We hold these truths to be self-evident, that all men are created equal, that they are endowed by their Creator with certain unalienable Rights, that among these are Life, Liberty and the pursuit of Happiness. That to secure these rights, Governments are instituted among Men, deriving their just powers from the consent of the governed. That whenever any Form of Government becomes destructive of these ends, it is the Right of the People to alter or to abolish it, and to institute new Government, laying its foundation on such principles and organizing its powers in such form, as to them shall seem most likely to effect their Safety and Happiness.`,
    grade_band: "6-8",
    word_count: 110,
    source_attribution: "Thomas Jefferson et al., The Declaration of Independence (1776), public domain",
    questions: [
      { question: "What three rights are specifically mentioned as unalienable?", type: "literal" },
      { question: "Where do governments get their powers from?", type: "literal" },
      { question: "According to this passage, when is it acceptable to change a government?", type: "inferential" },
    ],
  },
  {
    title: "from The Call of the Wild",
    text: `Buck did not read the newspapers, or he would have known that trouble was brewing, not alone for himself, but for every tide-water dog, strong of muscle and with warm, long hair, from Puget Sound to San Diego. Because men, groping in the Arctic darkness, had found a yellow metal, and because steamship and transportation companies were booming the find, thousands of men were rushing into the Northland. These men wanted dogs, and the dogs they wanted were heavy dogs, with strong muscles by which to toil, and furry coats to protect them from the frost.`,
    grade_band: "6-8",
    word_count: 98,
    source_attribution: "Jack London, The Call of the Wild (1903), public domain",
    questions: [
      { question: "What is the 'yellow metal' that men found?", type: "inferential" },
      { question: "What kind of dogs were the men looking for?", type: "literal" },
      { question: "Why couldn't Buck know about the trouble that was brewing?", type: "literal" },
    ],
  },
  {
    title: "Bees and Pollination",
    text: `Bees play a vital role in our food system. As they move from flower to flower collecting nectar, pollen sticks to their fuzzy bodies. When they visit the next flower, some of this pollen rubs off, allowing plants to produce seeds and fruit. Without bees, many of our favorite foods would disappear. Apples, almonds, blueberries, and cucumbers all depend on bee pollination. Scientists estimate that bees pollinate about one-third of the food we eat. Protecting bee populations is essential for maintaining our food supply.`,
    grade_band: "5-7",
    word_count: 85,
    source_attribution: "Original composition based on agricultural science",
    questions: [
      { question: "What sticks to bees' bodies as they collect nectar?", type: "literal" },
      { question: "Name two foods mentioned that depend on bee pollination.", type: "literal" },
      { question: "Why is it important to protect bee populations?", type: "inferential" },
    ],
  },
  {
    title: "The Water Cycle",
    text: `Water is always moving in a continuous cycle. The sun heats water in oceans, lakes, and rivers, causing it to evaporate into the air as water vapor. As this vapor rises, it cools and condenses into tiny droplets that form clouds. When the droplets become too heavy, they fall as precipitation—rain, snow, sleet, or hail. This water collects in rivers and streams, flowing back to the oceans, where the cycle begins again. The water cycle has been operating for billions of years, recycling the same water over and over. The water you drink today may have once been part of a dinosaur's swamp.`,
    grade_band: "5-7",
    word_count: 108,
    source_attribution: "Original composition based on earth science",
    questions: [
      { question: "What causes water to evaporate?", type: "literal" },
      { question: "Name two forms of precipitation mentioned in the passage.", type: "literal" },
      { question: "What does the author mean by saying the water you drink may have been part of a dinosaur's swamp?", type: "inferential" },
    ],
  },
];

async function seed() {
  console.log("Seeding passages and questions...\n");

  for (const passage of passages) {
    // Check if passage already exists
    const { data: existing } = await supabase
      .from("passages")
      .select("id")
      .eq("title", passage.title)
      .single();

    let passageId: string;

    if (existing) {
      console.log(`⏭ ${passage.title} (already exists)`);
      passageId = existing.id;
    } else {
      const { data: inserted, error } = await supabase
        .from("passages")
        .insert({
          title: passage.title,
          text: passage.text,
          grade_band: passage.grade_band,
          word_count: passage.word_count,
          source_attribution: passage.source_attribution,
        })
        .select("id")
        .single();

      if (error || !inserted) {
        console.error(`✗ Error inserting "${passage.title}":`, error?.message);
        continue;
      }

      console.log(`✓ ${passage.title}`);
      passageId = inserted.id;
    }

    // Seed questions for this passage
    for (let i = 0; i < passage.questions.length; i++) {
      const q = passage.questions[i];

      // Check if question already exists
      const { data: existingQ } = await supabase
        .from("passage_questions")
        .select("id")
        .eq("passage_id", passageId)
        .eq("question", q.question)
        .single();

      if (existingQ) {
        continue; // Question already exists
      }

      const { error: qError } = await supabase
        .from("passage_questions")
        .insert({
          passage_id: passageId,
          question: q.question,
          question_type: q.type,
          display_order: i,
        });

      if (qError) {
        console.error(`  ✗ Error inserting question: ${qError.message}`);
      } else {
        console.log(`  + Question ${i + 1}: "${q.question.substring(0, 40)}..."`);
      }
    }
  }

  console.log("\nDone seeding!");
}

seed().catch(console.error);
