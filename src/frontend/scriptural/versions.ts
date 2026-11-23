// The Bible versions Scriptural serves, from the Scriptural app's version list
// (src/components/bible-study/utils/bibleVersions.ts there), limited to those
// whose whole text is in its database. Licensed versions open to any signed-in
// Scriptural account; Scriptural's database enforces that, not this list.

export interface ScripturalVersion {
    code: string
    name: string
    language: string
    copyright?: string
    licensed?: boolean
}

export const SCRIPTURAL_VERSIONS: ScripturalVersion[] = [
    { code: "NKJV", name: "New King James Version", language: "English", copyright: "\u00a9 1982 Thomas Nelson. Used by permission.", licensed: true },
    { code: "KJV", name: "King James Version", language: "English", copyright: "Public domain. Text via API.Bible." },
    { code: "NIV", name: "New International Version", language: "English", copyright: "\u00a9 1973\u20132011 Biblica. Used by permission.", licensed: true },
    { code: "NLT", name: "New Living Translation", language: "English", copyright: "\u00a9 1996\u20132015 Tyndale House Foundation.", licensed: true },
    { code: "ESV", name: "English Standard Version", language: "English", copyright: "\u00a9 2001 Crossway, Good News Publishers.", licensed: true },
    { code: "AMPC", name: "Amplified Bible, Classic Edition", language: "English", copyright: "\u00a9 1954\u20131987 The Lockman Foundation.", licensed: true },
    { code: "MSG", name: "The Message", language: "English", copyright: "\u00a9 1993\u20132018 Eugene H. Peterson, NavPress.", licensed: true },
    { code: "BSB", name: "Berean Standard Bible", language: "English" },
    { code: "CSB", name: "Christian Standard Bible", language: "English", copyright: "\u00a9 2017 Holman Bible Publishers.", licensed: true },
    { code: "GW", name: "God's Word Translation", language: "English", copyright: "\u00a9 1995\u20132020 God's Word to the Nations.", licensed: true },
    { code: "GNT", name: "Good News Translation", language: "English", copyright: "\u00a9 1992 American Bible Society.", licensed: true },
    { code: "ERV", name: "Easy-to-Read Version", language: "English", copyright: "\u00a9 2006 Bible League International.", licensed: true },
    { code: "EASY", name: "Easy English Bible", language: "English", copyright: "\u00a9 MissionAssist. Used by permission.", licensed: true },
    { code: "NIRV", name: "New International Reader's Version", language: "English", copyright: "\u00a9 1996\u20132014 Biblica. Used by permission.", licensed: true },
    { code: "NET", name: "New English Translation", language: "English", copyright: "\u00a9 1996\u20132019 Biblical Studies Press.", licensed: true },
    { code: "MEV", name: "Modern English Version", language: "English", copyright: "\u00a9 2014\u20132024 United Bible Association.", licensed: true },
    { code: "TPT", name: "The Passion Translation", language: "English", copyright: "\u00a9 2017\u20132020 Passion & Fire Ministries.", licensed: true },
    { code: "NASB", name: "New American Standard Bible", language: "English", copyright: "\u00a9 1960\u20132020 The Lockman Foundation.", licensed: true },
    { code: "NRSV", name: "New Revised Standard Version", language: "English", copyright: "\u00a9 1989 National Council of Churches.", licensed: true },
    { code: "HCSB", name: "Holman Christian Standard Bible", language: "English", copyright: "\u00a9 1999\u20132009 Holman Bible Publishers.", licensed: true },
    { code: "LSB", name: "Legacy Standard Bible", language: "English", copyright: "\u00a9 2021 The Lockman Foundation.", licensed: true },
    { code: "ASV", name: "American Standard Version", language: "English", copyright: "Public domain. Text via API.Bible." },
    { code: "RSV", name: "Revised Standard Version", language: "English", copyright: "\u00a9 1946\u20131971 National Council of Churches.", licensed: true },
    { code: "DARBY", name: "Darby Translation", language: "English" },
    { code: "YLT", name: "Young's Literal Translation", language: "English" },
    { code: "TLB", name: "The Living Bible", language: "English", copyright: "\u00a9 1971 Tyndale House Foundation.", licensed: true },
    { code: "TYNDALE", name: "Tyndale Bible (1537)", language: "English" },
    { code: "SVD", name: "Smith-Van Dyck (1865)", language: "Arabic", copyright: "Public domain (1865)." },
    { code: "CUV1919", name: "Chinese Union Version (1919, Traditional)", language: "Chinese", copyright: "Public domain (1919)." },
    { code: "CUV1919S", name: "Chinese Union Version (1919, Simplified)", language: "Chinese", copyright: "Public domain (1919). Simplified-script conversion of CUV1919." },
    { code: "LSG", name: "Louis Segond (1910)", language: "French", copyright: "Public domain (1910)." },
    { code: "LUT1912", name: "Lutherbibel (1912)", language: "German", copyright: "Public domain (1912)." },
    { code: "RVR1909", name: "Reina-Valera (1909)", language: "Spanish", copyright: "Public domain (1909)." },
    { code: "DB1885", name: "Diodati Bibbia (1885)", language: "Italian", copyright: "Public domain (1885)." },
    { code: "A1753", name: "Almeida (1753)", language: "Portuguese", copyright: "Public domain (1753)." },
    { code: "LMT1979", name: "Littafi Mai Tsarki (1979)", language: "Hausa", copyright: "\u00a9 Bible Society of Nigeria, 1979." },
    { code: "HEB1977", name: "Hebrew Bible (1977)", language: "Hebrew", copyright: "Public domain (Wikisource digitization; NT: Delitzsch, 1877)." },
    { code: "ABTAG", name: "Ang Biblia (1982)", language: "Filipino", copyright: "\u00a9 Philippine Bible Society, 1982." },
    { code: "IRVPUN", name: "Indian Revised Version (2019)", language: "Punjabi", copyright: "\u00a9 2019 Bridge Connectivity Solutions. CC BY-SA 4.0." },
    { code: "YBCV", name: "Yoruba Bible Crowther Version (2012)", language: "Yoruba", copyright: "\u00a9 Bible Society of Nigeria, 2012." },
    { code: "IGBOB", name: "Igbo Bible (2006)", language: "Igbo", copyright: "\u00a9 Bible Society of Nigeria, 1906/2006." }
]
