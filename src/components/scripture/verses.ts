/**
 * Bible verses shown at the top of the Overview: one pinned verse and one that changes on every visit.
 * All text is the New Living Translation, quoted word for word.
 *
 * Scripture quotations are taken from the Holy Bible, New Living Translation, copyright © 1996, 2004, 2015 by
 * Tyndale House Foundation. Used by permission of Tyndale House Publishers, Carol Stream, Illinois 60188.
 * All rights reserved. (Tyndale allows up to 500 verses without written permission; in non-salable media the
 * initials "NLT" after each quotation suffice, which the verse band shows.)
 *
 * "LORD" stands for the small-caps rendering of God's name in the NLT; the band typesets it as small caps.
 */

export interface Verse {
  /** Stable key, e.g. "heb-13-5" (also stored in the "last shown" cookie). */
  id: string;
  reference: string;
  text: string;
}

export const PINNED_VERSE: Verse = {
  id: "rom-8-18",
  reference: "Romans 8:18",
  text: "Yet what we suffer now is nothing compared to the glory he will reveal to us later.",
};

/** God's faithfulness, his promise never to leave us, and his promised blessing and provision. */
export const ROTATING_VERSES: readonly Verse[] = [
  {
    id: "deu-31-6",
    reference: "Deuteronomy 31:6",
    text: "So be strong and courageous! Do not be afraid and do not panic before them. For the LORD your God will personally go ahead of you. He will neither fail you nor abandon you.",
  },
  {
    id: "deu-31-8",
    reference: "Deuteronomy 31:8",
    text: "Do not be afraid or discouraged, for the LORD will personally go ahead of you. He will be with you; he will neither fail you nor abandon you.",
  },
  {
    id: "heb-13-5",
    reference: "Hebrews 13:5",
    text: "Don’t love money; be satisfied with what you have. For God has said, “I will never fail you. I will never abandon you.”",
  },
  {
    id: "jos-1-9",
    reference: "Joshua 1:9",
    text: "This is my command—be strong and courageous! Do not be afraid or discouraged. For the LORD your God is with you wherever you go.",
  },
  {
    id: "isa-41-10",
    reference: "Isaiah 41:10",
    text: "Don’t be afraid, for I am with you. Don’t be discouraged, for I am your God. I will strengthen you and help you. I will hold you up with my victorious right hand.",
  },
  {
    id: "lam-3-22",
    reference: "Lamentations 3:22–23",
    text: "The faithful love of the LORD never ends! His mercies never cease. Great is his faithfulness; his mercies begin afresh each morning.",
  },
  {
    id: "deu-7-9",
    reference: "Deuteronomy 7:9",
    text: "Understand, therefore, that the LORD your God is indeed God. He is the faithful God who keeps his covenant for a thousand generations and lavishes his unfailing love on those who love him and obey his commands.",
  },
  {
    id: "num-23-19",
    reference: "Numbers 23:19",
    text: "God is not a man, so he does not lie. He is not human, so he does not change his mind. Has he ever spoken and failed to act? Has he ever promised and not carried it through?",
  },
  {
    id: "psa-23-1",
    reference: "Psalm 23:1",
    text: "The LORD is my shepherd; I have all that I need.",
  },
  {
    id: "mat-28-20",
    reference: "Matthew 28:20",
    text: "Teach these new disciples to obey all the commands I have given you. And be sure of this: I am with you always, even to the end of the age.",
  },
  {
    id: "rom-8-28",
    reference: "Romans 8:28",
    text: "And we know that God causes everything to work together for the good of those who love God and are called according to his purpose for them.",
  },
  {
    id: "rom-8-38",
    reference: "Romans 8:38–39",
    text: "And I am convinced that nothing can ever separate us from God’s love. Neither death nor life, neither angels nor demons, neither our fears for today nor our worries about tomorrow—not even the powers of hell can separate us from God’s love. No power in the sky above or in the earth below—indeed, nothing in all creation will ever be able to separate us from the love of God that is revealed in Christ Jesus our Lord.",
  },
  {
    id: "1co-1-9",
    reference: "1 Corinthians 1:9",
    text: "God will do this, for he is faithful to do what he says, and he has invited you into partnership with his Son, Jesus Christ our Lord.",
  },
  {
    id: "2th-3-3",
    reference: "2 Thessalonians 3:3",
    text: "But the Lord is faithful; he will strengthen you and guard you from the evil one.",
  },
  {
    id: "psa-37-25",
    reference: "Psalm 37:25",
    text: "Once I was young, and now I am old. Yet I have never seen the godly abandoned or their children begging for bread.",
  },
  {
    id: "psa-46-1",
    reference: "Psalm 46:1",
    text: "God is our refuge and strength, always ready to help in times of trouble.",
  },
  {
    id: "psa-36-5",
    reference: "Psalm 36:5",
    text: "Your unfailing love, O LORD, is as vast as the heavens; your faithfulness reaches beyond the clouds.",
  },
  {
    id: "heb-10-23",
    reference: "Hebrews 10:23",
    text: "Let us hold tightly without wavering to the hope we affirm, for God can be trusted to keep his promise.",
  },
  {
    id: "psa-9-10",
    reference: "Psalm 9:10",
    text: "Those who know your name trust in you, for you, O LORD, do not abandon those who search for you.",
  },
  {
    id: "php-1-6",
    reference: "Philippians 1:6",
    text: "And I am certain that God, who began the good work within you, will continue his work until it is finally finished on the day when Christ Jesus returns.",
  },
  {
    id: "jas-1-17",
    reference: "James 1:17",
    text: "Whatever is good and perfect is a gift coming down to us from God our Father, who created all the lights in the heavens. He never changes or casts a shifting shadow.",
  },
  {
    id: "zep-3-17",
    reference: "Zephaniah 3:17",
    text: "For the LORD your God is living among you. He is a mighty savior. He will take delight in you with gladness. With his love, he will calm all your fears. He will rejoice over you with joyful songs.",
  },
  {
    id: "jhn-14-18",
    reference: "John 14:18",
    text: "No, I will not abandon you as orphans—I will come to you.",
  },
  {
    id: "psa-121-7",
    reference: "Psalm 121:7–8",
    text: "The LORD keeps you from all harm and watches over your life. The LORD keeps watch over you as you come and go, both now and forever.",
  },
  {
    id: "isa-54-10",
    reference: "Isaiah 54:10",
    text: "“For the mountains may move and the hills disappear, but even then my faithful love for you will remain. My covenant of blessing will never be broken,” says the LORD, who has mercy on you.",
  },
  {
    id: "psa-100-5",
    reference: "Psalm 100:5",
    text: "For the LORD is good. His unfailing love continues forever, and his faithfulness continues to each generation.",
  },
  {
    id: "mal-3-10",
    reference: "Malachi 3:10",
    text: "“Bring all the tithes into the storehouse so there will be enough food in my Temple. If you do,” says the LORD of Heaven’s Armies, “I will open the windows of heaven for you. I will pour out a blessing so great you won’t have enough room to take it in! Try it! Put me to the test!”",
  },
  {
    id: "php-4-19",
    reference: "Philippians 4:19",
    text: "And this same God who takes care of me will supply all your needs from his glorious riches, which have been given to us in Christ Jesus.",
  },
  {
    id: "pro-3-9",
    reference: "Proverbs 3:9–10",
    text: "Honor the LORD with your wealth and with the best part of everything you produce. Then he will fill your barns with grain, and your vats will overflow with good wine.",
  },
  {
    id: "2co-9-8",
    reference: "2 Corinthians 9:8",
    text: "And God will generously provide all you need. Then you will always have everything you need and plenty left over to share with others.",
  },
  {
    id: "luk-6-38",
    reference: "Luke 6:38",
    text: "Give, and you will receive. Your gift will return to you in full—pressed down, shaken together to make room for more, running over, and poured into your lap. The amount you give will determine the amount you get back.",
  },
  {
    id: "jer-29-11",
    reference: "Jeremiah 29:11",
    text: "“For I know the plans I have for you,” says the LORD. “They are plans for good and not for disaster, to give you a future and a hope.”",
  },
  {
    id: "psa-84-11",
    reference: "Psalm 84:11",
    text: "For the LORD God is our sun and our shield. He gives us grace and glory. The LORD will withhold no good thing from those who do what is right.",
  },
  {
    id: "num-6-24",
    reference: "Numbers 6:24–26",
    text: "May the LORD bless you and protect you. May the LORD smile on you and be gracious to you. May the LORD show you his favor and give you his peace.",
  },
  {
    id: "mat-6-33",
    reference: "Matthew 6:33",
    text: "Seek the Kingdom of God above all else, and live righteously, and he will give you everything you need.",
  },
  {
    id: "eph-3-20",
    reference: "Ephesians 3:20",
    text: "Now all glory to God, who is able, through his mighty power at work within us, to accomplish infinitely more than we might ask or think.",
  },
  {
    id: "pro-10-22",
    reference: "Proverbs 10:22",
    text: "The blessing of the LORD makes a person rich, and he adds no sorrow with it.",
  },
];

/** Cookie holding the id of the verse shown last, so a refresh never repeats it. Not sensitive. */
export const VERSE_COOKIE = "tenth-verse";

/**
 * Picks the rotating verse for this visit: random, but never the one shown last (`lastId`, from the cookie; an
 * unknown or missing id excludes nothing). `random` returns a number in [0, 1), like Math.random.
 */
export function pickVerse(lastId: string | undefined, random: () => number = Math.random): Verse {
  const choices = ROTATING_VERSES.filter((verse) => verse.id !== lastId);
  const index = Math.min(choices.length - 1, Math.max(0, Math.floor(random() * choices.length)));
  return choices[index]!;
}

/** Splits verse text so "LORD" can be typeset in small caps; other text passes through unchanged. */
export function verseParts(text: string): { text: string; divineName: boolean }[] {
  return text
    .split(/\b(LORD)\b/)
    .filter((part) => part !== "")
    .map((part) => ({ text: part, divineName: part === "LORD" }));
}
