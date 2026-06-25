/**
 * Level 4 Passages (740L-940L)
 * CORE USE CASE: Below-grade middle schoolers (reading at 4th-5th grade level)
 * These are 6th graders reading at 4th-grade level
 *
 * Original passages - no copyright restrictions
 */

import { Passage } from "./library";

export const LEVEL_4_PASSAGES: Passage[] = [
  {
    id: "L4-A-mars",
    title: "Living on Mars",
    author: "Original",
    source: "original",
    lexile: 820,
    reading_level: 4,
    form: "A",
    word_count: 338,
    genre: "nonfiction",
    themes: ["space", "science", "future", "technology"],
    grade_content: "6-8",
    text: `Scientists and engineers are working on plans to send humans to Mars. The red planet sits about one hundred forty million miles from Earth, and the journey would take roughly seven months. While no one has made this trip yet, some experts believe the first astronauts could land on Mars within the next twenty years.

Living on Mars would be very different from living on Earth. The planet has no breathable air. Its atmosphere is mostly carbon dioxide, which humans cannot breathe. Anyone living there would need to stay inside sealed habitats or wear special suits whenever they went outside.

The temperature on Mars is another challenge. On a warm day, it might reach fifty degrees near the equator. But at night, temperatures can drop to negative one hundred degrees or colder. Heating these habitats would require enormous amounts of energy.

Water is scarce on Mars, but it does exist. Scientists have found ice beneath the surface and at the polar caps. Future settlers could mine this ice and melt it for drinking water. They might also use it to grow plants inside greenhouses, producing fresh food far from Earth.

One advantage Mars has over space stations is gravity. While Martian gravity is only about one-third as strong as Earth's, it is much better than the weightlessness astronauts experience on the International Space Station. This gravity would help settlers stay healthier during their time on Mars.

Some people question whether humans should try to live on Mars at all. The cost would be enormous, and the risks are high. Others argue that becoming a species that lives on more than one planet is essential for humanity's long-term survival.

Whether or not you agree, the dream of reaching Mars continues to inspire scientists, engineers, and ordinary people around the world. The first Martians may already be alive today, waiting for their chance to make history.`,
    questions: [
      {
        id: "L4-A-1",
        question: "How long would it take to travel from Earth to Mars?",
        type: "literal",
      },
      {
        id: "L4-A-2",
        question: "What are two challenges of living on Mars mentioned in the passage?",
        type: "literal",
      },
      {
        id: "L4-A-3",
        question: "Why might some people think living on Mars is worth the risks and costs?",
        type: "inferential",
      },
    ],
  },
  {
    id: "L4-B-bridge",
    title: "The Bridge That Changed Brooklyn",
    author: "Original",
    source: "original",
    lexile: 860,
    reading_level: 4,
    form: "B",
    word_count: 325,
    genre: "nonfiction",
    themes: ["history", "engineering", "New York City", "perseverance"],
    grade_content: "6-8",
    text: `Before 1883, the only way to travel between Manhattan and Brooklyn was by ferry boat. Thousands of people made this trip every day, but the journey was slow and sometimes dangerous. In winter, ice could trap the boats. In summer, fog made navigation difficult. The people of both cities dreamed of a bridge that would connect them.

Building such a bridge seemed almost impossible. The East River was too wide and too deep for ordinary construction methods. Ships needed to pass beneath it, so the bridge would have to be extremely tall. Many engineers said it could not be done.

John Roebling believed otherwise. He designed a suspension bridge held up by thick steel cables anchored in massive stone towers. The cables would be strong enough to support the weight of the bridge and everyone crossing it. His design was brilliant, but Roebling died from an accident before construction could begin.

His son, Washington Roebling, took over the project. He supervised workers as they built the foundation deep underwater. But Washington became seriously ill from the dangerous conditions. Unable to visit the construction site, he watched through a telescope from his bedroom window while his wife, Emily, delivered his instructions to the workers.

After fourteen years of construction, the Brooklyn Bridge finally opened on May 24, 1883. It was the longest suspension bridge in the world at that time. More than one hundred fifty thousand people walked across it on opening day, marveling at the views of the harbor and the city.

The bridge transformed both cities. Brooklyn's population grew rapidly as people could now live there and work in Manhattan. Today, the Brooklyn Bridge remains one of the most famous landmarks in New York City, a symbol of what determination and engineering skill can accomplish.`,
    questions: [
      {
        id: "L4-B-1",
        question: "How did people travel between Manhattan and Brooklyn before the bridge was built?",
        type: "literal",
      },
      {
        id: "L4-B-2",
        question: "What happened to Washington Roebling during the construction?",
        type: "literal",
      },
      {
        id: "L4-B-3",
        question: "Why was building the Brooklyn Bridge considered almost impossible at the time?",
        type: "inferential",
      },
    ],
  },
  {
    id: "L4-C-wolves",
    title: "The Return of the Wolves",
    author: "Original",
    source: "original",
    lexile: 800,
    reading_level: 4,
    form: "C",
    word_count: 319,
    genre: "nonfiction",
    themes: ["animals", "environment", "science", "ecosystems"],
    grade_content: "6-8",
    text: `For nearly seventy years, no wolves lived in Yellowstone National Park. Hunters and ranchers had eliminated them by 1926, believing wolves were dangerous pests that killed livestock. But scientists soon noticed that something strange was happening to the park without its wolves.

Elk populations exploded. Without wolves to hunt them, elk herds grew larger and larger. They ate so many young trees that new forests could not grow. The riverbanks became bare because elk devoured all the willows and aspens. Without these plants, songbirds lost their nesting spots. Beavers, which need willows to survive, nearly vanished from the park.

In 1995, wildlife officials made a bold decision. They brought fourteen wolves from Canada and released them in Yellowstone. Many people were worried. Would the wolves attack hikers? Would they wander outside the park and kill cattle? Some ranchers protested loudly against the plan.

What happened next surprised almost everyone. The wolves began hunting elk, just as nature intended. The elk, now alert to danger, stopped lingering near the rivers. Young trees began growing again along the riverbanks. Within a few years, willows and aspens were thriving. Songbirds returned. Beaver populations recovered.

But the changes went even further. The new trees stabilized the riverbanks with their roots. This actually changed how the rivers flowed, reducing erosion and creating new habitats for fish. Scientists realized that wolves had shaped the entire landscape in ways no one had predicted.

Today, about a hundred wolves live in Yellowstone. Tourists travel from around the world hoping to see them. The return of the wolves has taught scientists an important lesson: every species plays a role in its ecosystem, and removing even one can set off a chain of unexpected changes.`,
    questions: [
      {
        id: "L4-C-1",
        question: "Why were wolves originally removed from Yellowstone?",
        type: "literal",
      },
      {
        id: "L4-C-2",
        question: "What happened to the elk population after the wolves were gone?",
        type: "literal",
      },
      {
        id: "L4-C-3",
        question: "How did bringing back wolves help more than just controlling the elk population?",
        type: "inferential",
      },
    ],
  },
];
