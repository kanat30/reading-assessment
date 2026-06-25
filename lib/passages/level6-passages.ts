/**
 * Level 6 Passages (925L-1070L)
 * On-grade 7th graders
 *
 * Original passages - no copyright restrictions
 */

import { Passage } from "./library";

export const LEVEL_6_PASSAGES: Passage[] = [
  {
    id: "L6-A-algorithms",
    title: "The Hidden Power of Algorithms",
    author: "Original",
    source: "original",
    lexile: 960,
    reading_level: 6,
    form: "A",
    word_count: 348,
    genre: "nonfiction",
    themes: ["technology", "society", "computers", "ethics"],
    grade_content: "6-8",
    text: `Every time you use a search engine, scroll through social media, or stream a video, algorithms are working behind the scenes. These mathematical formulas analyze your behavior and make predictions about what you want to see. While algorithms have made technology more convenient and personalized, they also raise important questions about influence and fairness.

An algorithm is essentially a set of instructions for solving a problem or completing a task. When you search for something online, algorithms sort through billions of web pages in fractions of a second to deliver what they calculate to be the most relevant results. Streaming services use algorithms to recommend movies and songs based on your previous choices. Navigation apps calculate the fastest route by analyzing traffic patterns in real time.

The power of algorithms extends far beyond entertainment. Banks use them to decide whether to approve loans. Employers use them to screen job applications. Courts in some areas use them to help determine sentences. These applications have sparked controversy because algorithms can reflect and amplify human biases present in the data they were trained on.

Researchers have documented cases where facial recognition algorithms performed worse on darker skin tones, where hiring algorithms favored male candidates, and where medical algorithms underestimated health needs for certain racial groups. These outcomes occur not because programmers intended discrimination, but because the historical data used to train these systems contained existing inequalities.

Understanding how algorithms shape our experiences matters more than ever. The videos recommended to you, the news stories you see, and the advertisements targeting you are all curated by these invisible systems. They can create echo chambers where people only encounter information confirming their existing beliefs.

As algorithms become more sophisticated and influential, society must grapple with difficult questions about transparency, accountability, and control. Who decides what algorithms prioritize? Who is responsible when they cause harm? These questions will only become more pressing as artificial intelligence continues to advance.`,
    questions: [
      {
        id: "L6-A-1",
        question: "What is an algorithm?",
        type: "literal",
      },
      {
        id: "L6-A-2",
        question: "What are two examples of how algorithms are used beyond entertainment?",
        type: "literal",
      },
      {
        id: "L6-A-3",
        question: "Why might algorithms sometimes produce unfair or biased results?",
        type: "inferential",
      },
    ],
  },
  {
    id: "L6-B-languages",
    title: "When Languages Disappear",
    author: "Original",
    source: "original",
    lexile: 990,
    reading_level: 6,
    form: "B",
    word_count: 336,
    genre: "nonfiction",
    themes: ["culture", "language", "history", "diversity"],
    grade_content: "6-8",
    text: `Approximately seven thousand languages are spoken around the world today. By the end of this century, linguists estimate that nearly half of them will have vanished completely. Each time a language dies, humanity loses not just words and grammar, but an entire way of understanding the world.

Languages disappear for many reasons. When younger generations grow up speaking dominant languages like English, Spanish, or Mandarin, they may stop learning their ancestral tongues. Economic pressures often encourage this shift, as speaking a widely used language creates more opportunities for education and employment. Government policies have sometimes actively suppressed minority languages through schooling and official business.

What is lost when a language dies? Every language contains unique concepts that do not translate directly into other languages. The Yaghan language of southern Chile has a word that means "the wordless yet meaningful look shared by two people who both desire to initiate something, but both are reluctant to start." The Tsonga language of southern Africa has a word for "treading carefully on hot sand." These expressions reflect particular environments, relationships, and experiences.

Languages also carry scientific knowledge. Indigenous communities often have detailed vocabularies for local plants, animals, weather patterns, and ecological relationships developed over generations of observation. When these languages disappear, this accumulated wisdom often disappears with them.

Efforts to preserve endangered languages have increased in recent decades. Linguists work with communities to document languages, creating dictionaries, recordings, and teaching materials. Technology has become an ally, with apps and websites helping people learn ancestral languages. Some communities have established immersion schools where children learn entirely in their heritage language.

These preservation efforts recognize that linguistic diversity enriches all of humanity. Just as we work to protect endangered species and ecosystems, many believe we should work to protect the diverse ways humans have developed to communicate and understand reality.`,
    questions: [
      {
        id: "L6-B-1",
        question: "How many languages are spoken in the world today, and how many might disappear?",
        type: "literal",
      },
      {
        id: "L6-B-2",
        question: "What are two reasons why languages disappear?",
        type: "literal",
      },
      {
        id: "L6-B-3",
        question: "Why might losing a language mean losing more than just words?",
        type: "inferential",
      },
    ],
  },
  {
    id: "L6-C-sleep",
    title: "Why Teenagers Need More Sleep",
    author: "Original",
    source: "original",
    lexile: 940,
    reading_level: 6,
    form: "C",
    word_count: 331,
    genre: "nonfiction",
    themes: ["health", "science", "teenagers", "school"],
    grade_content: "6-8",
    text: `Scientific research has demonstrated that teenagers require between eight and ten hours of sleep each night for optimal health. Yet studies show that most adolescents in the United States get fewer than seven hours during the school week. This chronic sleep deprivation has consequences that extend far beyond feeling tired in class.

During adolescence, the brain undergoes significant development. Sleep is when much of this crucial work happens. Neural connections are strengthened or pruned. Memories from the day are consolidated. Hormones essential for growth are released. When teenagers do not get enough sleep, these processes are disrupted, affecting learning, mood, and physical development.

Biological changes during puberty make the situation even more challenging. A shift in circadian rhythms causes teenagers to naturally feel sleepy later at night and alert later in the morning. This is not laziness or poor choices but a genuine biological change. Asking a teenager to fall asleep at nine o'clock can feel as unnatural to them as asking an adult to fall asleep at six.

Many school districts have begun examining their start times in response to this research. Districts that have shifted to later start times for middle and high schools report encouraging results. Students are more alert, attendance improves, and some studies have shown improvements in academic performance and reductions in car accidents among teenage drivers.

Critics worry about the practical challenges of later start times. Rescheduling affects after-school activities, jobs, childcare arrangements, and transportation systems. Some parents need their teenagers home to watch younger siblings. Communities must weigh these concerns against the documented health benefits of adequate sleep.

For individual teenagers, understanding sleep science can help them make better choices when possible. Limiting screen time before bed, maintaining consistent sleep schedules even on weekends, and creating dark, quiet sleeping environments can all improve sleep quality and duration.`,
    questions: [
      {
        id: "L6-C-1",
        question: "How much sleep do teenagers need each night?",
        type: "literal",
      },
      {
        id: "L6-C-2",
        question: "What biological change makes it harder for teenagers to fall asleep early?",
        type: "literal",
      },
      {
        id: "L6-C-3",
        question: "Why do some communities hesitate to change school start times even if it would help students sleep more?",
        type: "inferential",
      },
    ],
  },
];
