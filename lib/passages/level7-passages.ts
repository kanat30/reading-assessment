/**
 * Level 7 Passages (970L-1185L)
 * On-grade 8th graders / Advanced readers
 *
 * Original passages - no copyright restrictions
 */

import { Passage } from "./library";

export const LEVEL_7_PASSAGES: Passage[] = [
  {
    id: "L7-A-plastic",
    title: "The Plastic Problem in Our Oceans",
    author: "Original",
    source: "original",
    lexile: 1020,
    reading_level: 7,
    form: "A",
    word_count: 356,
    genre: "nonfiction",
    themes: ["environment", "science", "pollution", "solutions"],
    grade_content: "6-8",
    text: `Every year, approximately eleven million metric tons of plastic waste enters the world's oceans. This staggering amount is projected to triple by 2040 unless dramatic changes occur in how humanity produces, uses, and disposes of plastic materials. The consequences for marine ecosystems have already been severe, but the full extent of the damage may not be understood for decades.

Plastic pollution affects ocean life at every level. Large pieces of debris entangle sea turtles, seals, and whales. Seabirds mistake floating plastic for food and feed it to their chicks, who may starve with stomachs full of indigestible material. As plastic breaks down into smaller fragments, it infiltrates the food chain at its foundation. Plankton consume microscopic plastic particles, which are then eaten by small fish, which are eaten by larger fish, concentrating these pollutants as they move up through the ecosystem.

Scientists have documented plastic particles in the bodies of marine organisms at all depths, from surface waters to the deepest ocean trenches. Researchers have found microplastics in commercial seafood, in sea salt, and in samples of ocean water from virtually every location tested. The chemicals associated with plastic production and degradation add another layer of concern regarding potential health effects.

Addressing this crisis requires intervention at multiple points. Some approaches focus on cleanup, developing technologies to remove existing plastic from oceans and waterways. Others emphasize prevention, redesigning products and packaging to eliminate unnecessary plastic or use materials that biodegrade safely. Policy initiatives have banned certain single-use plastics in numerous countries, while industry-led efforts explore alternative materials and improved recycling systems.

Individual actions contribute to the solution as well. Reducing plastic consumption, properly disposing of waste, and supporting businesses with sustainable practices all create market pressure for change. However, experts emphasize that systemic changes in production and waste management will ultimately have the greatest impact.

The plastic crisis presents a clear example of how human innovation can create unforeseen environmental consequences. Solving it will require equally innovative approaches to materials science, policy, and global cooperation.`,
    questions: [
      {
        id: "L7-A-1",
        question: "How much plastic waste enters the oceans each year?",
        type: "literal",
      },
      {
        id: "L7-A-2",
        question: "How does plastic pollution affect animals at different levels of the food chain?",
        type: "literal",
      },
      {
        id: "L7-A-3",
        question: "Why do experts believe systemic changes are more important than individual actions for solving this problem?",
        type: "inferential",
      },
    ],
  },
  {
    id: "L7-B-ai",
    title: "Artificial Intelligence and the Future of Work",
    author: "Original",
    source: "original",
    lexile: 1050,
    reading_level: 7,
    form: "B",
    word_count: 349,
    genre: "nonfiction",
    themes: ["technology", "future", "careers", "society"],
    grade_content: "6-8",
    text: `Advances in artificial intelligence are transforming industries at an unprecedented pace. Systems that can learn from data, recognize patterns, and make decisions are automating tasks once thought to require uniquely human capabilities. While previous technological revolutions primarily affected manual labor, AI is increasingly performing cognitive work, raising fundamental questions about the future of employment.

Already, AI systems draft legal documents, diagnose medical conditions, analyze financial data, and create artistic content. Customer service chatbots handle millions of interactions daily. Autonomous vehicles are being tested for commercial transportation. Each application represents tasks that previously required years of human training and experience. The speed of development suggests that many more occupations will be affected in coming years.

Economists disagree about whether this transformation will ultimately create or destroy jobs. Optimists point to history, noting that past technological revolutions generated more employment than they eliminated, though often in different sectors. They argue that AI will handle routine tasks while humans focus on work requiring creativity, emotional intelligence, and complex problem-solving. New industries and occupations will emerge that we cannot yet imagine.

Pessimists counter that AI differs from previous technologies because it can improve itself through learning. As systems become more capable, they may encroach on precisely those creative and interpersonal domains that optimists believe will remain human territory. Even if new jobs emerge, the transition period could cause significant economic disruption for workers whose skills become obsolete.

Preparing for this uncertain future requires adaptation at multiple levels. Education systems must emphasize skills that complement rather than compete with AI capabilities. Social safety nets may need strengthening to support workers during career transitions. Policies governing AI development and deployment will shape how benefits and disruptions are distributed across society.

For young people entering the workforce, flexibility and continuous learning will likely prove essential. The ability to adapt, acquire new skills, and collaborate effectively with intelligent machines may determine success in an economy where the nature of work continues to evolve rapidly.`,
    questions: [
      {
        id: "L7-B-1",
        question: "What are two examples of tasks that AI systems can now perform?",
        type: "literal",
      },
      {
        id: "L7-B-2",
        question: "Why do some economists believe AI could create more jobs than it eliminates?",
        type: "literal",
      },
      {
        id: "L7-B-3",
        question: "What skills does the author suggest will be most valuable in a future with more AI?",
        type: "inferential",
      },
    ],
  },
  {
    id: "L7-C-voting",
    title: "The History of Voting Rights in America",
    author: "Original",
    source: "original",
    lexile: 1010,
    reading_level: 7,
    form: "C",
    word_count: 341,
    genre: "nonfiction",
    themes: ["history", "democracy", "civil rights", "government"],
    grade_content: "6-8",
    text: `When the United States Constitution was ratified in 1788, voting rights were determined by individual states rather than federal law. Most states restricted voting to white male property owners, excluding the vast majority of the population from participation in democracy. The expansion of voting rights would require nearly two centuries of advocacy, protest, and constitutional amendment.

The Fifteenth Amendment, ratified in 1870, prohibited denying the vote based on race. However, many states circumvented this amendment through poll taxes, literacy tests, and other barriers designed to prevent African American citizens from exercising their rights. These restrictions persisted in many places until the Voting Rights Act of 1965 provided federal enforcement mechanisms.

Women gained the constitutional right to vote through the Nineteenth Amendment in 1920, following decades of organized activism. The movement had employed diverse tactics including speeches, parades, lobbying, and civil disobedience. Despite their achievement, women of color in many states continued to face the same barriers that restricted Black male voters.

The Twenty-Sixth Amendment, ratified in 1971, lowered the voting age from twenty-one to eighteen. This change was driven partly by the argument that individuals old enough to be drafted for military service should be able to vote for the officials making decisions about war and peace. Youth activism during the Vietnam War era helped build momentum for this reform.

Each expansion of voting rights faced resistance from those who benefited from existing arrangements. Arguments against extending suffrage often claimed that certain groups were unqualified to participate in democratic decision-making. Yet time and again, these restrictions were overcome as Americans recognized the fundamental principle that legitimate government requires the consent of the governed.

Contemporary debates about voter identification requirements, registration procedures, and electoral systems continue this historical pattern. Questions about who can vote, how easily they can do so, and whether their votes are fairly counted remain central to American democracy. Understanding this history provides context for ongoing discussions about electoral participation.`,
    questions: [
      {
        id: "L7-C-1",
        question: "Who was allowed to vote when the Constitution was first ratified?",
        type: "literal",
      },
      {
        id: "L7-C-2",
        question: "What methods did some states use to prevent African Americans from voting after the Fifteenth Amendment?",
        type: "literal",
      },
      {
        id: "L7-C-3",
        question: "Based on the passage, what common pattern appears throughout the history of voting rights in America?",
        type: "inferential",
      },
    ],
  },
];
