/**
 * Level 3 Passages (520L-820L)
 * For struggling middle school readers (reading at 3rd-4th grade level)
 *
 * Original passages - no copyright restrictions
 */

import { Passage } from "./library";

export const LEVEL_3_PASSAGES: Passage[] = [
  {
    id: "L3-A-migration",
    title: "The Journey of Monarch Butterflies",
    author: "Original",
    source: "original",
    lexile: 680,
    reading_level: 3,
    form: "A",
    word_count: 312,
    genre: "nonfiction",
    themes: ["animals", "nature", "migration", "science"],
    grade_content: "6-8",
    text: `Every fall, millions of monarch butterflies begin an incredible journey. These small orange and black insects travel up to three thousand miles from Canada and the United States to the mountains of central Mexico. It is one of the longest migrations of any insect in the world.

The butterflies cannot survive the cold winters of the north. They need warm temperatures to stay alive. So when the days grow shorter and the air turns cool, the monarchs know it is time to leave. They gather in large groups and begin flying south.

The journey takes about two months. Along the way, the butterflies stop to rest and drink nectar from flowers. They need this energy to keep flying. Some days they travel up to one hundred miles. Other days, strong winds or rain force them to stop and wait.

When the monarchs finally reach Mexico, they settle in forests high in the mountains. Millions of butterflies cover the trees, turning them orange. The butterflies cluster together on branches to stay warm through the winter months. They barely move until spring arrives.

In March, the butterflies begin their journey back north. But here is the amazing part: the butterflies that fly north are not the same ones that flew south. The original butterflies lay eggs along the way and then die. Their children and grandchildren continue the journey, somehow knowing exactly where to go.

Scientists are still trying to understand how monarchs navigate such long distances. They believe the butterflies use the sun and the Earth's magnetic field as guides. Whatever the answer, the monarch migration remains one of nature's most remarkable events.`,
    questions: [
      {
        id: "L3-A-1",
        question: "How far do monarch butterflies travel during their migration?",
        type: "literal",
      },
      {
        id: "L3-A-2",
        question: "Why do monarch butterflies migrate to Mexico?",
        type: "literal",
      },
      {
        id: "L3-A-3",
        question: "What is surprising about which butterflies complete the journey back north?",
        type: "inferential",
      },
    ],
  },
  {
    id: "L3-B-subway",
    title: "Building the First Subway",
    author: "Original",
    source: "original",
    lexile: 720,
    reading_level: 3,
    form: "B",
    word_count: 298,
    genre: "nonfiction",
    themes: ["history", "transportation", "New York City", "engineering"],
    grade_content: "6-8",
    text: `In the early 1900s, the streets of New York City were a mess. Horses pulled carriages through crowded roads. Trains ran on tracks above the streets, making terrible noise. People needed a better way to get around the growing city.

The solution was to build a railroad underground. Workers would dig tunnels beneath the busy streets where trains could run without blocking traffic above. It was a bold idea, but many people doubted it would work. How could you dig tunnels under a city full of buildings, pipes, and wires?

Construction began in 1900. Thousands of workers dug through rock and dirt using picks, shovels, and dynamite. The work was dangerous and difficult. Men worked in dark tunnels filled with dust and smoke. Some sections flooded with water. Others collapsed without warning.

Despite the challenges, workers completed the first subway line in just four years. On October 27, 1904, the subway opened to the public. More than one hundred thousand people rode the trains on that first day. They paid five cents for a ticket and marveled at the clean stations with their white tiles and electric lights.

The subway changed New York City forever. People could now travel from one end of the city to the other in less than an hour. Workers could live far from their jobs and still get to work on time. Neighborhoods that once seemed too far away suddenly became connected.

Today, the New York City subway is one of the largest transit systems in the world. Millions of people ride it every day, traveling through tunnels that workers dug more than a century ago.`,
    questions: [
      {
        id: "L3-B-1",
        question: "What problem was the subway designed to solve?",
        type: "literal",
      },
      {
        id: "L3-B-2",
        question: "When did the first New York City subway open?",
        type: "literal",
      },
      {
        id: "L3-B-3",
        question: "How did the subway change the way people lived in New York City?",
        type: "inferential",
      },
    ],
  },
  {
    id: "L3-C-octopus",
    title: "The Clever Octopus",
    author: "Original",
    source: "original",
    lexile: 750,
    reading_level: 3,
    form: "C",
    word_count: 305,
    genre: "nonfiction",
    themes: ["animals", "ocean", "science", "intelligence"],
    grade_content: "6-8",
    text: `The octopus may be one of the smartest animals in the ocean. With eight flexible arms and a soft body, it looks strange compared to other sea creatures. But scientists have discovered that this unusual animal can solve problems, use tools, and even play games.

In aquariums around the world, octopuses have learned to open jars to get food inside. They figure out how to unscrew lids, pull out plugs, and squeeze through tiny openings. Some have even escaped from their tanks by climbing out and crawling across the floor to reach other tanks with food.

What makes the octopus so clever? Much of its intelligence comes from its unusual brain. An octopus has nine brains in total. One central brain controls its body, while eight smaller brains help control each arm. This means an octopus can do several things at once without getting confused.

Octopuses are also masters of disguise. They can change the color and texture of their skin in less than a second. They use this ability to hide from predators or sneak up on prey. Some octopuses can even make themselves look like other animals, such as flatfish or sea snakes.

Despite their intelligence, octopuses live short lives. Most species live only one to two years. Scientists wonder what these animals might accomplish if they lived longer. Could they learn even more complex skills? Might they develop ways to communicate with each other?

Researchers continue to study octopuses to understand how their brains work. What they learn might help us understand intelligence itself and how it develops in different kinds of animals.`,
    questions: [
      {
        id: "L3-C-1",
        question: "How many brains does an octopus have?",
        type: "literal",
      },
      {
        id: "L3-C-2",
        question: "What are two ways octopuses have shown their intelligence?",
        type: "literal",
      },
      {
        id: "L3-C-3",
        question: "Why do scientists find it interesting that octopuses live such short lives?",
        type: "inferential",
      },
    ],
  },
];
