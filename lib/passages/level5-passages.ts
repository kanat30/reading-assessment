/**
 * Level 5 Passages (830L-1010L)
 * On-grade 6th graders
 *
 * Original passages - no copyright restrictions
 */

import { Passage } from "./library";

export const LEVEL_5_PASSAGES: Passage[] = [
  {
    id: "L5-A-deepocean",
    title: "Mysteries of the Deep Ocean",
    author: "Original",
    source: "original",
    lexile: 890,
    reading_level: 5,
    form: "A",
    word_count: 342,
    genre: "nonfiction",
    themes: ["ocean", "science", "exploration", "discovery"],
    grade_content: "6-8",
    text: `The deepest parts of the ocean remain largely unexplored. While humans have walked on the moon and sent robots to Mars, more than eighty percent of Earth's ocean floor has never been mapped or seen. The extreme conditions of the deep sea make exploration incredibly challenging, but scientists are constantly discovering astonishing forms of life in these dark waters.

At depths below one thousand meters, sunlight cannot penetrate. This region, known as the midnight zone, exists in complete darkness. The pressure at these depths would crush an unprotected human instantly. Water temperatures hover just a few degrees above freezing. Yet life thrives here in unexpected abundance.

Many deep-sea creatures produce their own light through a process called bioluminescence. Anglerfish dangle glowing lures to attract prey. Lanternfish have rows of lights along their bodies like tiny lanterns. Some squid release clouds of glowing ink to confuse predators. Scientists estimate that bioluminescence is one of the most common traits among ocean animals, yet we know surprisingly little about how different species use this remarkable ability.

Near underwater volcanic vents, researchers have discovered entire ecosystems that exist without any sunlight whatsoever. Giant tube worms, ghostly white crabs, and bacteria that feed on chemicals from the Earth's core cluster around these vents. These communities have changed our understanding of where life can exist. Some scientists believe similar environments might harbor life on moons like Europa or Enceladus.

New technology is slowly opening the deep ocean to exploration. Remotely operated vehicles can now dive to the deepest trenches. Advanced cameras capture high-definition video of creatures never before seen. With each expedition, scientists encounter species unknown to science.

The deep ocean reminds us that Earth still holds profound mysteries. We may live on this planet, but in many ways, we have only begun to explore it.`,
    questions: [
      {
        id: "L5-A-1",
        question: "What percentage of the ocean floor has never been mapped or seen?",
        type: "literal",
      },
      {
        id: "L5-A-2",
        question: "What is bioluminescence, and why do deep-sea creatures use it?",
        type: "literal",
      },
      {
        id: "L5-A-3",
        question: "Why have discoveries near volcanic vents changed scientists' understanding of life?",
        type: "inferential",
      },
    ],
  },
  {
    id: "L5-B-basketball",
    title: "How Basketball Became a Global Game",
    author: "Original",
    source: "original",
    lexile: 920,
    reading_level: 5,
    form: "B",
    word_count: 328,
    genre: "nonfiction",
    themes: ["sports", "history", "culture", "innovation"],
    grade_content: "6-8",
    text: `Basketball was invented in December 1891 by James Naismith, a physical education instructor in Massachusetts. Naismith needed an indoor game to keep his students active during the cold winter months. Using a soccer ball and two peach baskets nailed to a gymnasium balcony, he created a simple game with thirteen basic rules. Within a century, basketball would become one of the most popular sports on Earth.

The game spread quickly throughout the United States. By 1936, basketball became an official Olympic sport, introducing it to an international audience. But the game truly went global in the 1990s when the National Basketball Association began showcasing its star players to audiences worldwide. Suddenly, children in China, Argentina, and Spain were watching the same games as fans in Chicago and Los Angeles.

Television and the internet accelerated basketball's growth. Fans anywhere in the world could watch live games and highlights. Young players studied the moves of their favorite stars and practiced them on courts in their own neighborhoods. The style of play evolved as different countries contributed their own techniques and strategies.

Today, the NBA features players from more than forty different countries. International players have become some of the league's biggest stars, winning championships and earning recognition as the best in the world. Meanwhile, professional leagues have emerged across Europe, Asia, and Australia, each developing its own passionate fan base.

Basketball's appeal crosses cultural boundaries because the basic skills translate everywhere. A court and a ball are all you need to start playing. The game rewards creativity, teamwork, and individual brilliance in equal measure. Whether played on polished hardwood floors or cracked concrete schoolyards, the joy of the game remains the same.

From a gym in Massachusetts to courts around the globe, basketball has become a universal language.`,
    questions: [
      {
        id: "L5-B-1",
        question: "Who invented basketball, and why did he create the game?",
        type: "literal",
      },
      {
        id: "L5-B-2",
        question: "When did basketball become an Olympic sport?",
        type: "literal",
      },
      {
        id: "L5-B-3",
        question: "Why does the author call basketball 'a universal language'?",
        type: "inferential",
      },
    ],
  },
  {
    id: "L5-C-memory",
    title: "The Science of Memory",
    author: "Original",
    source: "original",
    lexile: 880,
    reading_level: 5,
    form: "C",
    word_count: 335,
    genre: "nonfiction",
    themes: ["science", "brain", "learning", "psychology"],
    grade_content: "6-8",
    text: `Your brain does not record memories like a video camera. Instead, it stores bits and pieces of information and reconstructs them each time you remember something. This process is both remarkable and imperfect, which is why our memories can sometimes be unreliable or change over time.

When you experience something, different parts of your brain handle different aspects of that experience. The sound of your friend's voice, the color of the room, and your emotional reaction are all processed separately. Your brain then links these pieces together through networks of connected cells called neurons.

Sleep plays a crucial role in forming lasting memories. While you rest, your brain sorts through the day's experiences, deciding what to keep and what to discard. Important information gets transferred from short-term storage to long-term memory. This is why studying before bed often helps you remember material better than cramming right before a test.

Scientists have discovered that emotions significantly impact how well we remember things. Events that trigger strong feelings, whether positive or negative, tend to leave deeper impressions in our minds. This evolutionary adaptation helped our ancestors remember dangerous situations to avoid or successful hunting grounds to revisit.

Memory also improves with repetition and connection. The more often you recall information, the stronger those neural pathways become. Connecting new facts to things you already know creates additional pathways to reach that memory. This is why mnemonic devices and study techniques that link concepts together are so effective.

Understanding how memory works can help you become a better learner. Taking breaks, getting enough sleep, engaging emotionally with material, and reviewing information over time all strengthen your ability to remember. Your brain is constantly adapting based on what you ask it to do, so the more you practice remembering, the better you become at it.`,
    questions: [
      {
        id: "L5-C-1",
        question: "How does the brain store memories, according to the passage?",
        type: "literal",
      },
      {
        id: "L5-C-2",
        question: "Why is sleep important for memory?",
        type: "literal",
      },
      {
        id: "L5-C-3",
        question: "Based on the passage, what study habits would help you remember things better?",
        type: "inferential",
      },
    ],
  },
];
