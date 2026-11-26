// Public-domain hymns only: words printed before 1929 by authors long dead.
// Written in the app's plain-text song format. Do not add words from memory unless certain.

export interface StarterHymn {
    id: string
    title: string
    author: string
    year: number
    words: string
}

// a chorus comes round after each verse
const withChorus = (chorus: string, verses: string[]) => verses.map((verse) => `[Verse]\n${verse}\n\n[Chorus]\n${chorus}`).join("\n\n")
const verses = (list: string[]) => list.map((verse) => `[Verse]\n${verse}`).join("\n\n")

export const STARTER_HYMNS: StarterHymn[] = [
    {
        id: "amazing_grace",
        title: "Amazing Grace",
        author: "John Newton",
        year: 1779,
        words: verses([
            "Amazing grace! how sweet the sound\nThat saved a wretch like me!\nI once was lost, but now am found,\nWas blind, but now I see.",
            "'Twas grace that taught my heart to fear,\nAnd grace my fears relieved;\nHow precious did that grace appear\nThe hour I first believed!",
            "Through many dangers, toils and snares,\nI have already come;\n'Tis grace hath brought me safe thus far,\nAnd grace will lead me home.",
            "The Lord has promised good to me,\nHis word my hope secures;\nHe will my shield and portion be\nAs long as life endures."
        ])
    },
    {
        id: "holy_holy_holy",
        title: "Holy, Holy, Holy",
        author: "Reginald Heber",
        year: 1826,
        words: verses([
            "Holy, holy, holy! Lord God Almighty!\nEarly in the morning our song shall rise to thee;\nHoly, holy, holy! merciful and mighty!\nGod in three Persons, blessed Trinity!",
            "Holy, holy, holy! all the saints adore thee,\nCasting down their golden crowns around the glassy sea;\nCherubim and seraphim falling down before thee,\nWhich wert, and art, and evermore shalt be.",
            "Holy, holy, holy! though the darkness hide thee,\nThough the eye of sinful man thy glory may not see,\nOnly thou art holy; there is none beside thee,\nPerfect in power, in love, and purity.",
            "Holy, holy, holy! Lord God Almighty!\nAll thy works shall praise thy name, in earth, and sky, and sea;\nHoly, holy, holy! merciful and mighty!\nGod in three Persons, blessed Trinity!"
        ])
    },
    {
        id: "what_a_friend",
        title: "What a Friend We Have in Jesus",
        author: "Joseph M. Scriven",
        year: 1855,
        words: verses([
            "What a friend we have in Jesus,\nAll our sins and griefs to bear!\nWhat a privilege to carry\nEverything to God in prayer!\n\nO what peace we often forfeit,\nO what needless pain we bear,\nAll because we do not carry\nEverything to God in prayer!",
            "Have we trials and temptations?\nIs there trouble anywhere?\nWe should never be discouraged,\nTake it to the Lord in prayer.\n\nCan we find a friend so faithful\nWho will all our sorrows share?\nJesus knows our every weakness,\nTake it to the Lord in prayer.",
            "Are we weak and heavy laden,\nCumbered with a load of care?\nPrecious Savior, still our refuge,\nTake it to the Lord in prayer.\n\nDo thy friends despise, forsake thee?\nTake it to the Lord in prayer;\nIn his arms he'll take and shield thee,\nThou wilt find a solace there."
        ])
    },
    {
        id: "blessed_assurance",
        title: "Blessed Assurance",
        author: "Fanny J. Crosby",
        year: 1873,
        words: withChorus("This is my story, this is my song,\nPraising my Savior all the day long;\nThis is my story, this is my song,\nPraising my Savior all the day long.", [
            "Blessed assurance, Jesus is mine!\nO what a foretaste of glory divine!\nHeir of salvation, purchase of God,\nBorn of his Spirit, washed in his blood.",
            "Perfect submission, perfect delight,\nVisions of rapture now burst on my sight;\nAngels descending bring from above\nEchoes of mercy, whispers of love.",
            "Perfect submission, all is at rest,\nI in my Savior am happy and blest,\nWatching and waiting, looking above,\nFilled with his goodness, lost in his love."
        ])
    },
    {
        id: "it_is_well",
        title: "It Is Well with My Soul",
        author: "Horatio G. Spafford",
        year: 1873,
        words: withChorus("It is well with my soul,\nIt is well, it is well with my soul.", [
            "When peace, like a river, attendeth my way,\nWhen sorrows like sea billows roll;\nWhatever my lot, thou hast taught me to say,\nIt is well, it is well with my soul.",
            "Though Satan should buffet, though trials should come,\nLet this blest assurance control,\nThat Christ has regarded my helpless estate,\nAnd hath shed his own blood for my soul.",
            "My sin, oh, the bliss of this glorious thought!\nMy sin, not in part but the whole,\nIs nailed to the cross, and I bear it no more,\nPraise the Lord, praise the Lord, O my soul!",
            "And, Lord, haste the day when the faith shall be sight,\nThe clouds be rolled back as a scroll;\nThe trump shall resound, and the Lord shall descend,\nEven so, it is well with my soul."
        ])
    },
    {
        id: "rock_of_ages",
        title: "Rock of Ages",
        author: "Augustus M. Toplady",
        year: 1776,
        words: verses([
            "Rock of Ages, cleft for me,\nLet me hide myself in thee;\nLet the water and the blood,\nFrom thy riven side which flowed,\nBe of sin the double cure,\nSave from wrath and make me pure.",
            "Not the labors of my hands\nCan fulfill thy law's demands;\nCould my zeal no respite know,\nCould my tears forever flow,\nAll for sin could not atone;\nThou must save, and thou alone.",
            "Nothing in my hand I bring,\nSimply to thy cross I cling;\nNaked, come to thee for dress;\nHelpless, look to thee for grace;\nFoul, I to the fountain fly;\nWash me, Savior, or I die.",
            "While I draw this fleeting breath,\nWhen mine eyes shall close in death,\nWhen I soar to worlds unknown,\nSee thee on thy judgment throne,\nRock of Ages, cleft for me,\nLet me hide myself in thee."
        ])
    },
    {
        id: "wondrous_cross",
        title: "When I Survey the Wondrous Cross",
        author: "Isaac Watts",
        year: 1707,
        words: verses([
            "When I survey the wondrous cross\nOn which the Prince of glory died,\nMy richest gain I count but loss,\nAnd pour contempt on all my pride.",
            "Forbid it, Lord, that I should boast,\nSave in the death of Christ my God!\nAll the vain things that charm me most,\nI sacrifice them to his blood.",
            "See from his head, his hands, his feet,\nSorrow and love flow mingled down!\nDid e'er such love and sorrow meet,\nOr thorns compose so rich a crown?",
            "Were the whole realm of nature mine,\nThat were a present far too small;\nLove so amazing, so divine,\nDemands my soul, my life, my all."
        ])
    },
    {
        id: "joy_to_the_world",
        title: "Joy to the World",
        author: "Isaac Watts",
        year: 1719,
        words: verses([
            "Joy to the world, the Lord is come!\nLet earth receive her King;\nLet every heart prepare him room,\nAnd heaven and nature sing.",
            "Joy to the world, the Savior reigns!\nLet men their songs employ;\nWhile fields and floods, rocks, hills, and plains\nRepeat the sounding joy.",
            "No more let sins and sorrows grow,\nNor thorns infest the ground;\nHe comes to make his blessings flow\nFar as the curse is found.",
            "He rules the world with truth and grace,\nAnd makes the nations prove\nThe glories of his righteousness,\nAnd wonders of his love."
        ])
    },
    {
        id: "come_thou_fount",
        title: "Come, Thou Fount of Every Blessing",
        author: "Robert Robinson",
        year: 1758,
        words: verses([
            "Come, thou Fount of every blessing,\nTune my heart to sing thy grace;\nStreams of mercy, never ceasing,\nCall for songs of loudest praise.\n\nTeach me some melodious sonnet,\nSung by flaming tongues above;\nPraise the mount! I'm fixed upon it,\nMount of thy redeeming love.",
            "Here I raise my Ebenezer;\nHither by thy help I'm come;\nAnd I hope, by thy good pleasure,\nSafely to arrive at home.\n\nJesus sought me when a stranger,\nWandering from the fold of God;\nHe, to rescue me from danger,\nInterposed his precious blood.",
            "O to grace how great a debtor\nDaily I'm constrained to be!\nLet thy goodness, like a fetter,\nBind my wandering heart to thee.\n\nProne to wander, Lord, I feel it,\nProne to leave the God I love;\nHere's my heart, O take and seal it,\nSeal it for thy courts above."
        ])
    },
    {
        id: "to_god_be_the_glory",
        title: "To God Be the Glory",
        author: "Fanny J. Crosby",
        year: 1875,
        words: withChorus("Praise the Lord, praise the Lord,\nLet the earth hear his voice!\nPraise the Lord, praise the Lord,\nLet the people rejoice!\n\nO come to the Father through Jesus the Son,\nAnd give him the glory, great things he hath done.", [
            "To God be the glory, great things he hath done!\nSo loved he the world that he gave us his Son,\nWho yielded his life an atonement for sin,\nAnd opened the life gate that all may go in.",
            "O perfect redemption, the purchase of blood,\nTo every believer the promise of God;\nThe vilest offender who truly believes,\nThat moment from Jesus a pardon receives.",
            "Great things he hath taught us, great things he hath done,\nAnd great our rejoicing through Jesus the Son;\nBut purer, and higher, and greater will be\nOur wonder, our transport, when Jesus we see."
        ])
    },
    {
        id: "thousand_tongues",
        title: "O for a Thousand Tongues to Sing",
        author: "Charles Wesley",
        year: 1739,
        words: verses([
            "O for a thousand tongues to sing\nMy great Redeemer's praise,\nThe glories of my God and King,\nThe triumphs of his grace!",
            "My gracious Master and my God,\nAssist me to proclaim,\nTo spread through all the earth abroad\nThe honors of thy name.",
            "Jesus! the name that charms our fears,\nThat bids our sorrows cease;\n'Tis music in the sinner's ears,\n'Tis life, and health, and peace.",
            "He breaks the power of canceled sin,\nHe sets the prisoner free;\nHis blood can make the foulest clean;\nHis blood availed for me."
        ])
    },
    {
        id: "doxology",
        title: "Doxology",
        author: "Thomas Ken",
        year: 1674,
        words: verses(["Praise God, from whom all blessings flow;\nPraise him, all creatures here below;\nPraise him above, ye heavenly host;\nPraise Father, Son, and Holy Ghost. Amen."])
    }
]
