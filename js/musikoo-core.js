/*
    Musikoo 公共核心模块
    ------------------------------------------------------------
    所有功能页（播放 / 编辑 / 歌眼抽取 / 新建曲谱）共用的
    MusicXML 解析、音高换算、时值模型、音符选择与片段生成逻辑。

    这里只放不依赖页面 DOM 与音频状态的纯函数 / XML 工具，
    页面自己的界面状态、播放器和图片渲染仍留在各自页面中。
*/

/* ---------------- 常量 ---------------- */

export const STEP_SEMITONE = {
    C:0, D:2, E:4, F:5, G:7, A:9, B:11
};

export const DYNAMIC_VELOCITY = {
    pppp:8, ppp:16, pp:24, p:33, mp:49,
    mf:64, f:80, ff:96, fff:112, ffff:126
};

/* part-name 里没有 midi-program 时，靠名字猜一个乐器 */
export const NAME_HINTS = [
    [/grand\s*piano|piano|钢琴/i, 0],
    [/e\.?\s*piano|electric\s*piano|电钢琴/i, 4],
    [/harpsichord|大键琴|羽管键琴/i, 6],
    [/organ|风琴|管风琴/i, 19],
    [/guitar|吉他/i, 25],
    [/bass|贝斯|低音提琴?/i, 32],
    [/violin|小提琴/i, 40],
    [/viola|中提琴/i, 41],
    [/cello|大提琴/i, 42],
    [/contrabass|double\s*bass|低音提琴/i, 43],
    [/strings?|弦乐/i, 48],
    [/choir|voices?|合唱/i, 52],
    [/trumpet|小号/i, 56],
    [/trombone|长号/i, 57],
    [/tuba|大号/i, 58],
    [/horn|圆号/i, 60],
    [/sax|萨克斯/i, 65],
    [/oboe|双簧管/i, 68],
    [/bassoon|巴松|大管/i, 70],
    [/clarinet|单簧管/i, 71],
    [/flute|长笛/i, 73],
    [/piccolo|短笛/i, 72],
    [/timpani|定音鼓/i, 47],
    [/harp|竖琴/i, 46],
    [/marimba|马林巴/i, 12],
    [/vibraphone|颤音琴/i, 11],
    [/sitar|西塔琴/i, 104]
];

export const DURATION_NAMES = {
    4:      "全音符",
    3:      "附点二分音符",
    2:      "二分音符",
    1.5:    "附点四分音符",
    1:      "四分音符",
    0.75:   "附点八分音符",
    0.5:    "八分音符",
    0.375:  "附点十六分音符",
    0.25:   "十六分音符",
    0.1875: "附点三十二分音符",
    0.125:  "三十二分音符",
    0.0625: "六十四分音符"
};

/* 新时值 → MusicXML <type>/<dot> */
export const NOTE_TYPE_TABLE = [
    { q:4,      type:"whole",   dots:0 },
    { q:3,      type:"half",    dots:1 },
    { q:2,      type:"half",    dots:0 },
    { q:1.5,    type:"quarter", dots:1 },
    { q:1,      type:"quarter", dots:0 },
    { q:0.75,   type:"eighth",  dots:1 },
    { q:0.5,    type:"eighth",  dots:0 },
    { q:0.375,  type:"16th",    dots:1 },
    { q:0.25,   type:"16th",    dots:0 },
    { q:0.1875, type:"32nd",    dots:1 },
    { q:0.125,  type:"32nd",    dots:0 },
    { q:0.0625, type:"64th",    dots:0 }
];

export function sourceStructure(doc){

    const names = new Map();

    doc.querySelectorAll("part-list > score-part").forEach(sp => {

        const id = sp.getAttribute("id");
        const name = childText(sp, "part-name") || id || "声部";

        let program = 0;

        const programText = sp.querySelector(
            "midi-instrument > midi-program"
        )?.textContent;

        if(programText){
            program = clamp(parseInt(programText, 10) - 1, 0, 127);
        }

        names.set(id, { name, program });
    });

    const partEls = Array.from(
        doc.querySelectorAll("score-partwise > part")
    );

    let measureCount = 0;

    const parts = partEls.map((partEl, index) => {

        const id = partEl.getAttribute("id");
        const meta = names.get(id) || {
            name:id || `声部${index + 1}`,
            program:0
        };

        let staves = 1;

        partEl.querySelectorAll("attributes > staves").forEach(el => {
            const n = parseInt(el.textContent, 10);
            if(n > staves) staves = n;
        });

        partEl.querySelectorAll("note > staff").forEach(el => {
            const n = parseInt(el.textContent, 10);
            if(n > staves) staves = n;
        });

        const count = directChildren(partEl, "measure").length;

        measureCount = Math.max(measureCount, count);

        return {
            partEl,
            index,
            id,
            name: meta.name,
            program: meta.program,
            staves,
            measureCount: count
        };
    });

    return { parts, measureCount };
}

export function clamp(v, min, max){
    return Math.min(max, Math.max(min, v));
}

export function childText(el, tagName){
    const c = directChild(el, tagName);
    return c ? c.textContent.trim() : "";
}

export function directChild(el, tagName){
    return Array.from(el.children)
        .find(c => c.tagName === tagName) || null;
}

export function directChildren(el, tagName){
    return Array.from(el.children).filter(c => c.tagName === tagName);
}

export function hasDirectChild(el, tagName){
    return !!directChild(el, tagName);
}

export function setChildText(el, tagName, value){
    let c = directChild(el, tagName);
    if(!c){
        c = el.ownerDocument.createElement(tagName);
        el.appendChild(c);
    }
    c.textContent = String(value);
}

export function xmlEscapeText(s){
    return String(s)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

export function pitchToMidi(pitchEl){

    const step =
        pitchEl.querySelector("step")?.textContent?.trim() || "C";

    const octave =
        parseInt(pitchEl.querySelector("octave")?.textContent) || 4;

    const alter =
        parseFloat(
            pitchEl.querySelector("alter")?.textContent || "0"
        ) || 0;

    const midi =
        (octave + 1) * 12
        + (STEP_SEMITONE[step] ?? 0)
        + alter;

    return clamp(Math.round(midi), 0, 127);
}

export function formatQ(q){
    return String(Number(q.toFixed(4)));
}


export function durationLabel(q){

    const key = Number(q.toFixed(4));
    const name = DURATION_NAMES[key];

    return `♩ ${formatQ(q)} 拍${name ? " · " + name : ""}`;
}

/* 新时值 → MusicXML <type>/<dot> */

/*
    拖动只落在“单个音符能够记谱”的时值上：
    2.5 拍之类需要连线拆分的长度不在表里，否则会出现
    duration=2.5、type=half 这种谱面与时值不一致的节点。
*/

export function snapNotatedDuration(q, minQ, maxQ, grid, anchorQ=null){

    const g = Math.max(0.03125, grid || 0.5);

    const allowed = NOTE_TYPE_TABLE
        .map(t => t.q)
        .filter(d =>

            d >= minQ - 1e-9 &&
            d <= maxQ + 1e-9 &&

            (
                /* 仍遵循用户选择的吸附网格，避免 1/2 拍网格下跳到附点八分 */
                Math.abs(d / g - Math.round(d / g)) < 1e-6 ||

                /* 已有音符本身比网格更细时，允许保持原时值 */
                (anchorQ != null && Math.abs(d - anchorQ) < 1e-9)
            )
        )
        .sort((a, b) => a - b);

    if(!allowed.length){
        return clamp(q, minQ, maxQ);
    }

    return allowed.reduce((best, d) =>
        Math.abs(d - q) < Math.abs(best - q) ? d : best
    , allowed[0]);
}

export function updateNoteType(noteEl, durQ){

    Array.from(noteEl.children).forEach(c => {
        if(
            c.tagName === "type" ||
            c.tagName === "dot" ||
            c.tagName === "time-modification"
        ){
            c.remove();
        }
    });

    const match = NOTE_TYPE_TABLE.find(t => Math.abs(t.q - durQ) < 1e-4)
        || NOTE_TYPE_TABLE.reduce((best, t) =>
            Math.abs(t.q - durQ) < Math.abs(best.q - durQ) ? t : best
        );

    const anchor =
        directChild(noteEl, "voice") ||
        directChild(noteEl, "duration");

    const typeEl = noteEl.ownerDocument.createElement("type");
    typeEl.textContent = match.type;

    if(anchor && anchor.nextSibling){
        noteEl.insertBefore(typeEl, anchor.nextSibling);
    }else{
        noteEl.appendChild(typeEl);
    }

    let cursor = typeEl;

    for(let i = 0; i < match.dots; i++){

        const dot = noteEl.ownerDocument.createElement("dot");

        if(cursor.nextSibling){
            noteEl.insertBefore(dot, cursor.nextSibling);
        }else{
            noteEl.appendChild(dot);
        }

        cursor = dot;
    }
}

export function notatedTickValues(divisions){

    const div = Math.max(1, divisions || 1);

    return [...new Set(
        NOTE_TYPE_TABLE
            .map(t => Math.round(t.q * div))
            .filter(v => v >= 1)
    )].sort((a, b) => b - a);
}

export function splitTicksIntoNotatable(ticks, divisions){

    let remain = Math.max(0, Math.round(ticks));
    const out = [];

    notatedTickValues(divisions).forEach(v => {

        while(remain >= v){
            out.push(v);
            remain -= v;
        }
    });

    if(remain > 0) out.push(remain);

    return out;
}

export function notatedQuarterValues(divisions){

    const div = Math.max(1, divisions || 1);

    return [...new Set(
        NOTE_TYPE_TABLE
            .map(t => t.q)
            .filter(q => {
                const ticks = Math.round(q * div);
                return ticks >= 1 && Math.abs(ticks / div - q) < 1e-6;
            })
    )].sort((a, b) => a - b);
}

/*
    从和弦组最后一个 note 往后看：
    - 连续的休止符 / forward 可以当作“可占用的空白”
    - 遇到下一个有音高的音符、装饰音或 backup 就停止
    - 如果到达小节末尾（或 voice 结束），剩余小节时间也算可用空白
*/

export function chordGroupFor(noteEl){

    let lead = noteEl;

    while(hasDirectChild(lead, "chord")){
        const prev = lead.previousElementSibling;
        if(!prev || prev.tagName !== "note") break;
        lead = prev;
    }

    const group = [lead];

    let next = lead.nextElementSibling;

    while(next && next.tagName === "note" && hasDirectChild(next, "chord")){
        group.push(next);
        next = next.nextElementSibling;
    }

    return group;
}

export function createFillForward(doc, ticks){

    const forward = doc.createElement("forward");

    forward.setAttribute("data-musikoo-fill", "1");

    const duration = doc.createElement("duration");
    duration.textContent = String(Math.max(1, Math.round(ticks)));

    forward.appendChild(duration);

    return forward;
}

export function backupTargetsFor(measureEl, divisions){

    const targets = new Map();

    let cursor = 0;

    Array.from(measureEl.children).forEach(el => {

        if(el.tagName === "attributes"){

            const d = directChild(el, "divisions");
            if(d) divisions = parseInt(d.textContent, 10) || divisions;
            return;
        }

        if(el.tagName === "backup"){

            const d = parseInt(
                directChild(el, "duration")?.textContent,
                10
            ) || 0;

            targets.set(el, Math.max(0, cursor - d));

            cursor = Math.max(0, cursor - d);
            return;
        }

        if(el.tagName === "forward"){

            cursor +=
                parseInt(directChild(el, "duration")?.textContent, 10) || 0;

            return;
        }

        if(el.tagName !== "note") return;

        if(hasDirectChild(el, "chord")) return;
        if(hasDirectChild(el, "grace")) return;

        cursor +=
            parseInt(directChild(el, "duration")?.textContent, 10) || 0;
    });

    return targets;
}

/*
    修改音符时值后，重新整理小节里的时间游标。
    音符时值在原位置改变后，同一 XML 声部里后面的音符会自然
    向前/向后移动；这里只需要修正 <backup> 的时长，并把声部
    末尾剩余的时间用不可见的 <forward> 补齐。
*/

export function normalizeMeasure(
    measureEl,
    divisions,
    nominalQ,
    skipFill=false,
    backupTargets=null
){

    measureEl.querySelectorAll('forward[data-musikoo-fill="1"]')
        .forEach(el => el.remove());

    const nominalTicks = Math.max(1, Math.round(nominalQ * divisions));

    let cursor = 0;

    Array.from(measureEl.children).forEach(el => {

        if(el.tagName === "attributes"){

            const d = directChild(el, "divisions");
            if(d){
                divisions = parseInt(d.textContent, 10) || divisions;
            }
            return;
        }

        if(el.tagName === "backup"){

            const target = backupTargets?.has(el)
                ? backupTargets.get(el)
                : 0;

            if(!skipFill && cursor > 0 && cursor < nominalTicks){

                measureEl.insertBefore(
                    createFillForward(measureEl.ownerDocument, nominalTicks - cursor),
                    el
                );

                cursor = nominalTicks;
            }

            const newTicks = Math.max(0, cursor - target);

            setChildText(el, "duration", Math.round(newTicks));

            cursor = target;

            return;
        }

        if(el.tagName === "forward"){

            cursor +=
                parseInt(directChild(el, "duration")?.textContent, 10) || 0;

            return;
        }

        if(el.tagName !== "note") return;

        if(hasDirectChild(el, "chord")) return;
        if(hasDirectChild(el, "grace")) return;

        cursor +=
            parseInt(directChild(el, "duration")?.textContent, 10) || 0;
    });

    if(!skipFill && cursor > 0 && cursor < nominalTicks){

        measureEl.appendChild(
            createFillForward(measureEl.ownerDocument, nominalTicks - cursor)
        );
    }
}

export function collectVoiceEvents(mEl, state, staffNo, voiceId){

    const events = [];

    let divisions = state.divisions;
    let cursorQ = 0;
    let lastNoteQ = 0;

    const targetStaff = String(staffNo);
    const targetVoice = String(voiceId);

    Array.from(mEl.children).forEach(el => {

        if(el.tagName === "attributes"){

            const d = directChild(el, "divisions");
            if(d) divisions = parseInt(d.textContent, 10) || divisions;
            return;
        }

        if(el.tagName === "backup"){

            const d = parseInt(
                directChild(el, "duration")?.textContent,
                10
            ) || 0;

            cursorQ = Math.max(0, cursorQ - d / divisions);
            return;
        }

        if(el.tagName === "forward"){

            const d = parseInt(
                directChild(el, "duration")?.textContent,
                10
            ) || 0;

            cursorQ += d / divisions;
            return;
        }

        if(el.tagName !== "note") return;

        const isChord = hasDirectChild(el, "chord");
        const isGrace = hasDirectChild(el, "grace");
        const isRest  = hasDirectChild(el, "rest");

        const dur = parseInt(
            directChild(el, "duration")?.textContent,
            10
        ) || 0;

        const durQ = dur / divisions;

        const noteStaff = childText(el, "staff") || "1";
        const noteVoice = childText(el, "voice") || "1";

        const q = isChord ? lastNoteQ : cursorQ;

        if(!isChord && !isGrace){
            cursorQ += durQ;
            lastNoteQ = q;
        }

        if(
            noteStaff !== targetStaff ||
            noteVoice !== targetVoice
        ){
            return;
        }

        if(isChord){
            const last = events[events.length - 1];
            if(last && Math.abs(last.q - q) < 1e-6){
                last.els.push(el);
                return;
            }
        }

        events.push({
            q,
            durQ,
            isRest,
            isGrace,
            els:[el]
        });
    });

    events.sort((a, b) => a.q - b.q);

    let maxEndQ = 0;

    events.forEach(e => {
        if(!e.isGrace){
            maxEndQ = Math.max(maxEndQ, e.q + e.durQ);
        }
    });

    return { events, divisions, maxEndQ };
}

export function collectXmlNotes(doc){

    const partEls = Array.from(
        doc.querySelectorAll("score-partwise > part")
    );

    const entries = [];
    const noteMap = new Map();
    const measureInfo = {};
    const measureInfoByIndex = {};

    partEls.forEach((partEl, partIndex) => {

        let divisions = 1;
        let beats = 4;
        let beatType = 4;

        const measureEls = directChildren(partEl, "measure");

        measureEls.forEach((mEl, mi) => {

            Array.from(mEl.children).forEach(el => {

                if(el.tagName !== "attributes") return;

                const d = directChild(el, "divisions");
                const b = directChild(el, "time") &&
                    childText(directChild(el, "time"), "beats");
                const bt = directChild(el, "time") &&
                    childText(directChild(el, "time"), "beat-type");

                if(d) divisions = parseInt(d.textContent, 10) || divisions;
                if(b) beats = parseInt(b, 10) || beats;
                if(bt) beatType = parseInt(bt, 10) || beatType;
            });

            const nominalQ = beats * (4 / beatType);

            let cursorQ = 0;
            let maxEndQ = 0;
            let lastNoteQ = 0;
            let currentVoice = "1";

            const voiceTotals = new Map();
            const measureEntries = [];

            const advance = q => {
                cursorQ = Math.max(0, cursorQ + q);
                maxEndQ = Math.max(maxEndQ, cursorQ);
            };

            Array.from(mEl.children).forEach(el => {

                if(el.tagName === "attributes"){

                    const d = directChild(el, "divisions");
                    const t = directChild(el, "time");

                    if(d) divisions = parseInt(d.textContent, 10) || divisions;
                    if(t){
                        beats = parseInt(childText(t, "beats"), 10) || beats;
                        beatType = parseInt(childText(t, "beat-type"), 10) || beatType;
                    }
                    return;
                }

                if(el.tagName === "backup"){

                    const d = parseInt(
                        directChild(el, "duration")?.textContent,
                        10
                    ) || 0;

                    cursorQ = Math.max(0, cursorQ - d / divisions);
                    return;
                }

                if(el.tagName === "forward"){

                    const d = parseInt(
                        directChild(el, "duration")?.textContent,
                        10
                    ) || 0;

                    const dq = d / divisions;

                    advance(dq);

                    if(!el.hasAttribute("data-musikoo-fill")){
                        voiceTotals.set(
                            currentVoice,
                            (voiceTotals.get(currentVoice) || 0) + dq
                        );
                    }

                    return;
                }

                if(el.tagName !== "note") return;

                const isChord = hasDirectChild(el, "chord");
                const isGrace = hasDirectChild(el, "grace");
                const isRest  = hasDirectChild(el, "rest");

                const dur = parseInt(
                    directChild(el, "duration")?.textContent,
                    10
                ) || 0;

                const durQ = dur / divisions;

                const voice = childText(el, "voice") || "1";
                const staff = childText(el, "staff") || "1";

                const q = isChord ? lastNoteQ : cursorQ;

                if(!isChord && !isGrace){
                    advance(durQ);
                    lastNoteQ = q;
                    currentVoice = voice;
                }

                if(isGrace) return;

                if(!isChord){
                    voiceTotals.set(
                        voice,
                        (voiceTotals.get(voice) || 0) + durQ
                    );
                }

                if(isRest) return;

                const pitchEl = directChild(el, "pitch");
                if(!pitchEl) return;

                const midi = pitchToMidi(pitchEl);

                const entry = {
                    doc,
                    partIndex,
                    mi,
                    measureEl: mEl,
                    noteEl: el,
                    staff,
                    voice,
                    startQ: q,
                    durQ,
                    midi,
                    divisions,
                    isChord,
                    isGrace,
                    isRest,
                    nominalQ,
                    isPickup: false,
                    voiceTotalQ: durQ,
                    maxDurQ: durQ,
                    measureSpanQ: nominalQ,
                    key:
                        `${mi}|${partIndex}|${staff}|${voice}|` +
                        `${Math.round(q * 10000)}|${midi}`,
                    _used: false
                };

                measureEntries.push(entry);
                entries.push(entry);

                if(!noteMap.has(entry.key)){
                    noteMap.set(entry.key, []);
                }

                noteMap.get(entry.key).push(entry);
            });

            const isPickup =
                mi === 0 && maxEndQ > 0 && maxEndQ < nominalQ;

            const spanQ = isPickup ? maxEndQ : nominalQ;

            const info = {
                partIndex,
                mi,
                measureEl: mEl,
                divisions,
                nominalQ,
                beats,
                beatType,
                isPickup,
                spanQ,
                maxEndQ,
                startQ: 0
            };

            measureInfo[`${partIndex}:${mi}`] = info;

            if(measureInfoByIndex[mi] == null){
                measureInfoByIndex[mi] = info;
            }

            measureEntries.forEach(entry => {

                entry.isPickup = isPickup;
                entry.measureSpanQ = spanQ;
                entry.voiceTotalQ =
                    voiceTotals.get(entry.voice) || entry.durQ;

                entry.maxDurQ = entry.durQ + Math.max(
                    0,
                    nominalQ - entry.voiceTotalQ
                );
            });
        });
    });

    return {
        doc,
        partEls,
        entries,
        noteMap,
        measureInfo,
        measureInfoByIndex
    };
}

export function readMeasureMeta(mEl){

    const meta = {
        repeatStart:false,
        repeatEnd:false,
        ending:null
    };

    mEl.querySelectorAll("barline").forEach(barline => {

        const repeat = barline.querySelector("repeat");

        if(repeat){

            const dir = repeat.getAttribute("direction");

            if(dir === "forward") meta.repeatStart = true;
            if(dir === "backward") meta.repeatEnd = true;
        }

        const ending = barline.querySelector("ending");

        if(ending){

            meta.ending = {
                number: ending.getAttribute("number") || "",
                type: ending.getAttribute("type")
            };
        }
    });

    return meta;
}

export function parsePartMeasures(partEl){

    let divisions = 1;
    let beats     = 4;
    let beatType  = 4;

    let velocity = 80;

    const measures = [];
    const openTies = new Map();

    /*
        装饰音不占谱面时间，先按声部挂起，
        等下一个真正发声的音符确定起点后再统一排进去。
    */
    const pendingGraces = new Map();

    /* 当前小节在整首曲子里的四分音符起点，用于跨小节连音线 */
    let measureStartQ = 0;

    Array.from(partEl.children)
        .filter(el => el.tagName === "measure")
        .forEach((mEl, measureIndex) => {

            const notes = [];
            const cc    = [];

            /*
                MusicXML 用 <backup>/<forward> 在文档里移动时间游标，
                不是让每个声部各自从 0 开始。按文档顺序维护游标，
                踏板、力度等 direction 的位置才不会跑到小节末尾。
            */
            let cursorQ   = 0;
            let maxEndQ   = 0;
            let lastNoteQ = 0;

            let measureTempo = null;

            const advance = q => {

                cursorQ = Math.max(0, cursorQ + q);
                maxEndQ = Math.max(maxEndQ, cursorQ);
            };

            Array.from(mEl.children).forEach(el => {

                if(el.tagName === "attributes"){

                    const d  = el.querySelector("divisions");
                    const b  = el.querySelector("time > beats");
                    const bt = el.querySelector("time > beat-type");

                    if(d)  divisions = parseInt(d.textContent) || divisions;
                    if(b)  beats     = parseInt(b.textContent) || beats;
                    if(bt) beatType  = parseInt(bt.textContent) || beatType;

                    return;
                }

                if(el.tagName === "backup"){

                    const d = parseInt(
                        el.querySelector("duration")?.textContent
                    ) || 0;

                    cursorQ = Math.max(0, cursorQ - d / divisions);

                    return;
                }

                if(el.tagName === "forward"){

                    const d = parseInt(
                        el.querySelector("duration")?.textContent
                    ) || 0;

                    advance(d / divisions);

                    return;
                }

                if(el.tagName === "direction" || el.tagName === "sound"){

                    const sound =
                        el.tagName === "sound"
                            ? el
                            : el.querySelector("sound");

                    if(sound?.getAttribute("tempo")){

                        const t = parseFloat(
                            sound.getAttribute("tempo")
                        );

                        if(t > 0) measureTempo = t;
                    }

                    const dyn = sound?.getAttribute("dynamics");

                    if(dyn){

                        velocity = clamp(
                            Math.round(parseFloat(dyn) * 0.9),
                            4, 127
                        );
                    }
                    else{

                        const mark =
                            el.querySelector("dynamics > *");

                        if(mark && DYNAMIC_VELOCITY[mark.tagName]){

                            velocity = DYNAMIC_VELOCITY[mark.tagName];
                        }
                    }

                    const pedal = el.querySelector("pedal");

                    if(pedal){

                        const type = pedal.getAttribute("type");

                        let value = null;

                        if(type === "start" || type === "change"){
                            value = 127;
                        }
                        else if(type === "stop"){
                            value = 0;
                        }

                        if(value !== null){

                            /*
                                <offset> 的单位是 divisions，
                                正负都允许。
                            */
                            const offset =
                                parseFloat(
                                    el.querySelector("offset")?.textContent
                                ) || 0;

                            cc.push({
                                atQ: Math.max(0, cursorQ + offset / divisions),
                                controller: 64,
                                value
                            });
                        }
                    }

                    return;
                }

                if(el.tagName !== "note") return;

                const isChord = !!el.querySelector("chord");
                const isGrace = !!el.querySelector("grace");
                const isRest  = !!el.querySelector("rest");

                const dur =
                    parseInt(
                        el.querySelector("duration")?.textContent
                    ) || 0;

                const durQ = dur / divisions;

                const voice =
                    el.querySelector("voice")?.textContent || "1";

                const staff =
                    el.querySelector("staff")?.textContent || "1";

                const vk = `${staff}_${voice}`;

                const q = isChord ? lastNoteQ : cursorQ;

                /*
                    和弦音与前一音同时开始，不推进游标；
                    装饰音不占时间，也不推进游标。
                */
                if(!isChord && !isGrace){

                    advance(durQ);
                    lastNoteQ = q;
                }

                if(isRest) return;

                const pitch = el.querySelector("pitch");
                if(!pitch) return;

                const midi = pitchToMidi(pitch);

                let noteVelocity = velocity;

                const velEl = el.querySelector("velocity");

                if(velEl){

                    noteVelocity = clamp(
                        Math.round(
                            parseFloat(velEl.textContent) * 1.27
                        ),
                        1, 127
                    );
                }

                /*
                    装饰音没有 duration，也不推进游标，
                    先挂起，等主音符确定起点后再排到它前面。
                */
                if(isGrace){

                    if(!pendingGraces.has(vk)){
                        pendingGraces.set(vk, []);
                    }

                    pendingGraces.get(vk).push({
                        midi,
                        velocity: noteVelocity
                    });

                    return;
                }

                const graces = pendingGraces.get(vk);

                if(graces?.length && durQ > 0){

                    pendingGraces.delete(vk);

                    /*
                        装饰音从主音符的拍点向前挤出时间，
                        主音符本身仍落在原来的拍点上，后续节奏不变。
                        整组最多 0.35 个四分音符，且不超过主音符的 60%，
                        保证每个装饰音都有足够长度、听得出音高。
                    */
                    const totalGraceQ =
                        Math.min(0.35, durQ * 0.6);

                    const stepQ =
                        totalGraceQ / graces.length;

                    graces.forEach((g, gi) => {

                        const gq =
                            q - totalGraceQ + gi * stepQ;

                        notes.push({
                            q: gq,
                            absQ: measureStartQ + gq,
                            durQ: Math.max(0.02, stepQ * 0.9),
                            midi: g.midi,
                            velocity: g.velocity
                        });
                    });
                }

                const ties =
                    Array.from(el.querySelectorAll("tie"))
                        .map(t => t.getAttribute("type"));

                const tieKey = `${vk}_${midi}`;

                /*
                    连音线：后一个音只延长前一个音，不重新触发
                */
                if(ties.includes("stop") && openTies.has(tieKey)){

                    const prev = openTies.get(tieKey);

                    /*
                        用整首曲子的绝对位置计算，不能只用小节内
                        的 q，否则跨小节的连音线会被小节线截断。
                    */
                    prev.durQ = Math.max(
                        prev.durQ,
                        measureStartQ + q + durQ - prev.absQ
                    );

                    if(ties.includes("start")){
                        openTies.set(tieKey, prev);
                    }
                    else{
                        openTies.delete(tieKey);
                    }

                    return;
                }

                const note = {
                    q,
                    absQ: measureStartQ + q,
                    durQ,
                    midi,
                    velocity: noteVelocity
                };

                notes.push(note);

                if(ties.includes("start")){
                    openTies.set(tieKey, note);
                }
            });

            const nominalQ = beats * (4 / beatType);

            /*
                弱起小节（anacrusis）或反复段落之间的短小节，
                实际时值比名义时值短。MuseScore 导出的这类小节
                经常不带 implicit="yes"（反复段落的弱起、第一/第二
                结尾尤其如此），所以不能只看第一小节或 implicit，
                只要内容不足整小节就按实际内容计时，否则这些小节
                会被补成整小节，听起来时值被延长。
            */
            const durationQ =
                maxEndQ > 0 && maxEndQ < nominalQ
                    ? maxEndQ
                    : nominalQ;

            measures.push({
                notes,
                cc,
                tempo: measureTempo,
                durationQ
            });

            measureStartQ += durationQ;
        });

    return measures;
}

export function parseMusicXML(xmlText, parsedDoc=null){

    const doc = parsedDoc || new DOMParser().parseFromString(
        xmlText,
        "application/xml"
    );

    if(doc.querySelector("parsererror")){
        throw new Error("MusicXML 不是合法的 XML");
    }

    const partEls =
        Array.from(doc.querySelectorAll("score-partwise > part"));

    if(!partEls.length){
        throw new Error("没有找到 <part>（仅支持 score-partwise）");
    }

    /* -------- part-list：名称 / 音色 / 音量 / 声像 -------- */

    const partMeta = new Map();

    doc.querySelectorAll("part-list > score-part").forEach(sp => {

        const id   = sp.getAttribute("id");
        const name =
            sp.querySelector("part-name")?.textContent?.trim() || id;

        const midiEl = sp.querySelector("midi-instrument");

        const programText =
            midiEl?.querySelector("midi-program")?.textContent;

        const program =
            programText
                ? clamp(parseInt(programText, 10) - 1, 0, 127)
                : guessProgram(name);

        const channelText =
            midiEl?.querySelector("midi-channel")?.textContent;

        const channel  = channelText ? parseInt(channelText, 10) : null;
        const volumeTxt = midiEl?.querySelector("volume")?.textContent;
        const panTxt    = midiEl?.querySelector("pan")?.textContent;

        partMeta.set(id, {
            id,
            name,
            program,
            channel,
            volume: volumeTxt ? clamp(parseFloat(volumeTxt), 0, 127) : 100,
            pan:    panTxt    ? clamp(parseFloat(panTxt), -64, 63) : 0,
            isPercussion: channel === 10
        });
    });

    /* -------- 每个声部独立解析 -------- */

    const parts = partEls.map((el, index) => {

        const id = el.getAttribute("id");

        const info = partMeta.get(id) || {
            id,
            name: id,
            program: 0,
            channel: null,
            volume: 100,
            pan: 0,
            isPercussion: false
        };

        return {
            info,
            index,
            measures: parsePartMeasures(el)
        };
    });

    /* -------- 通道分配 -------- */

    const usedChannels = new Set();

    parts.forEach(p => {

        if(p.info.isPercussion){
            p.info.channel = 9;
            usedChannels.add(9);
        }
    });

    parts.forEach(p => {

        if(typeof p.info.channel === "number" &&
           p.info.channel >= 1 &&
           p.info.channel <= 16 &&
           !p.info.isPercussion){

            const ch = p.info.channel - 1;

            if(!usedChannels.has(ch)){
                p.info.channel = ch;
                usedChannels.add(ch);
                return;
            }
        }

        if(typeof p.info.channel === "number" &&
           p.info.channel >= 0 &&
           p.info.channel <= 15 &&
           p.info.isPercussion){
            return;
        }

        let ch = 0;

        while(ch < 16 && (usedChannels.has(ch) || ch === 9)) ch++;

        if(ch >= 16) ch = p.index % 16;

        p.info.channel = ch;
        usedChannels.add(ch);
    });

    /* -------- 小节顺序（反复 / 房子） -------- */

    const firstPart   = parts[0];
    const measureMeta = firstPart.measures.map(() => ({
        repeatStart:false,
        repeatEnd:false,
        ending:null
    }));

    const firstMeasureEls =
        Array.from(partEls[0].children)
            .filter(el => el.tagName === "measure");

    firstMeasureEls.forEach((mEl, i) => {
        measureMeta[i] = readMeasureMeta(mEl);
    });

    const playbackMeasures = [];

    let repeatStart   = 0;
    let alreadyRepeated = false;

    for(let i = 0; i < measureMeta.length; i++){

        const meta = measureMeta[i];

        if(meta.repeatStart) repeatStart = i;

        if(
            alreadyRepeated &&
            meta.ending &&
            meta.ending.number.includes("1")
        ){
            continue;
        }

        playbackMeasures.push(i);

        if(meta.repeatEnd && !alreadyRepeated){

            alreadyRepeated = true;

            for(let j = repeatStart; j <= i; j++){

                const jm = measureMeta[j];

                if(
                    jm.ending &&
                    jm.ending.number.includes("1")
                ){
                    continue;
                }

                playbackMeasures.push(j);
            }
        }
    }

    /* -------- 速度表（优先 part 1） -------- */

    const tempos = [];

    firstPart.measures.forEach((m, i) => {

        if(m.tempo) tempos[i] = m.tempo;
    });

    if(!tempos[0]) tempos[0] = 120;

    /*
        MusicXML 的 <sound tempo> 就是四分音符 BPM，
        时间轴以四分音符为单位，直接 60/bpm 换算即可。
    */

    const measureDurations =
        firstPart.measures.map(m => m.durationQ);

    /* -------- 合成绝对时间轴 -------- */

    let timeline = [];
    const measureEvents = [];

    let noteSeq = 0;
    let tSec = 0;
    let bpm  = 120;

    playbackMeasures.forEach(mi => {

        const measureBpm = tempos[mi] ?? bpm;
        bpm = measureBpm;

        const spq = 60 / measureBpm;

        measureEvents.push({
            measureIndex: mi,
            startSec: tSec
        });

        parts.forEach(part => {

            const m = part.measures[mi];
            if(!m) return;

            m.notes.forEach(n => {

                const startSec = tSec + n.q * spq;
                const durSec   = Math.max(0.03, n.durQ * spq);

                const noteId = noteSeq++;

                timeline.push({
                    type:"on",
                    noteId,
                    channel: part.info.channel,
                    midi: n.midi,
                    velocity: n.velocity,
                    startSec
                });

                timeline.push({
                    type:"off",
                    noteId,
                    channel: part.info.channel,
                    midi: n.midi,
                    startSec: startSec + durSec
                });
            });

            m.cc.forEach(c => {

                timeline.push({
                    type:"cc",
                    channel: part.info.channel,
                    controller: c.controller,
                    value: c.value,
                    startSec: tSec + c.atQ * spq
                });
            });
        });

        tSec += (measureDurations[mi] ?? 4) * spq;
    });

    /*
        同一时刻先 noteOff 再 noteOn，避免同音高被误关。
        时间按 10 微秒取整后再比较，防止浮点误差把
        “先 off 后 on”排成“先 on 后 off”。
    */
    const timeKey = e => Math.round(e.startSec * 100000);

    /*
        小节线处经常同时出现“上一个音 noteOff”和“新小节踩下延音踏板”。
        如果踏板先于 noteOff 生效，上一个音会被踏板一直拖到新小节末
        （听感上就像那个音长了整整一小节）。这里把与 noteOff 同一时刻
        的踏板踩下事件推迟 1ms，确保先松开旧音再踩踏板。
    */
    const offTimes = new Set();

    timeline.forEach(e => {

        if(e.type === "off"){
            offTimes.add(`${e.channel}:${timeKey(e)}`);
        }
    });

    timeline.forEach(e => {

        if(
            e.type === "cc" &&
            e.controller === 64 &&
            e.value >= 64 &&
            offTimes.has(`${e.channel}:${timeKey(e)}`)
        ){
            e.startSec += 0.001;
        }
    });

    const sortTimeline = () => timeline.sort((a, b) => {

        const dt = timeKey(a) - timeKey(b);

        if(dt !== 0) return dt;

        const order = { off:0, cc:1, on:2 };

        /* 同一时刻先松开踏板，再踩下新踏板 */
        if(a.type === "cc" && b.type === "cc"){
            if(a.controller === 64 && b.controller === 64){
                return a.value - b.value;
            }
        }

        return order[a.type] - order[b.type];
    });

    sortTimeline();

    /*
        MIDI 同一通道、同一音高不能同时有两个独立发声的音。
        如果后一个同音高音符在前一个 noteOff 之前开始，
        把前一个的 noteOff 提前到后一个之前；否则后一个
        会被前一个的 noteOff 立刻掐掉（听起来像吞音）。
    */
    const offById = new Map();

    timeline.forEach(e => {
        if(e.type === "off") offById.set(e.noteId, e);
    });

    const lastOnByPitch = new Map();
    const dropped = new Set();

    timeline.forEach(e => {

        if(e.type !== "on") return;

        const key = `${e.channel}:${e.midi}`;
        const prev = lastOnByPitch.get(key);

        if(prev){

            const prevOff = offById.get(prev.noteId);

            if(prevOff && prevOff.startSec > e.startSec){

                /* 完全同时的同音重复只保留一个 */
                if(e.startSec - prev.startSec < 0.001){

                    const selfOff = offById.get(e.noteId);

                    dropped.add(e);
                    if(selfOff) dropped.add(selfOff);

                    return;
                }

                prevOff.startSec = Math.max(
                    prev.startSec + 0.0005,
                    e.startSec - 0.0005
                );
            }
        }

        lastOnByPitch.set(key, e);
    });

    if(dropped.size){
        timeline = timeline.filter(e => !dropped.has(e));
    }

    sortTimeline();

    return {
        tempo: tempos[0],
        partCount: parts.length,
        timeline,
        measureEvents,
        totalSec: tSec,
        scoreParts: parts.map(p => p.info)
    };
}

export function followingGapInfo(entry, group){

    const divisions = entry.divisions || 1;
    const spanTicks = Math.max(
        1,
        Math.round(entry.measureSpanQ * divisions)
    );

    const groupTicks =
        parseInt(directChild(group[0], "duration")?.textContent, 10) || 0;

    let cursorTicks =
        Math.round(entry.startQ * divisions) + groupTicks;

    const gaps = [];

    let el = group[group.length - 1].nextElementSibling;

    for(; el; el = el.nextElementSibling){

        if(el.tagName === "note"){

            if(hasDirectChild(el, "grace")){
                return { gaps, trailingTicks:0 };
            }

            if(hasDirectChild(el, "chord")) continue;

            const ticks =
                parseInt(directChild(el, "duration")?.textContent, 10) || 0;

            if(hasDirectChild(el, "rest")){
                gaps.push({ el, type:"rest", ticks });
                cursorTicks += ticks;
                continue;
            }

            return { gaps, trailingTicks:0 };
        }

        if(el.tagName === "forward"){

            const ticks =
                parseInt(directChild(el, "duration")?.textContent, 10) || 0;

            gaps.push({ el, type:"forward", ticks });
            cursorTicks += ticks;
            continue;
        }

        if(el.tagName === "backup"){
            return {
                gaps,
                trailingTicks: Math.max(0, spanTicks - cursorTicks)
            };
        }
    }

    return {
        gaps,
        trailingTicks: Math.max(0, spanTicks - cursorTicks)
    };
}

export function availableLengthenTicks(entry, group = null){

    const g = group || chordGroupFor(entry.noteEl);
    if(!g.length) return 0;

    const info = followingGapInfo(entry, g);

    return info.gaps.reduce((sum, gap) => sum + gap.ticks, 0)
        + info.trailingTicks;
}

export function maxDurationForEntry(entry){

    const divisions = entry.divisions || 1;
    const group = chordGroupFor(entry.noteEl);

    if(!group.length) return entry.durQ;

    const currentTicks =
        parseInt(directChild(group[0], "duration")?.textContent, 10) || 0;

    const spanTicks = Math.max(
        1,
        Math.round(entry.measureSpanQ * divisions)
    );

    const measureLimit =
        Math.max(currentTicks, spanTicks - Math.round(entry.startQ * divisions));

    const maxTicks = Math.min(
        measureLimit,
        currentTicks + availableLengthenTicks(entry, group)
    );

    return maxTicks / divisions;
}

/* 加长时占用后面的休止符 / forward / 小节尾部空白，返回实际占用量 */

export function consumeFollowingGap(entry, group, needTicks){

    if(needTicks <= 0) return 0;

    const divisions = entry.divisions || 1;
    const info = followingGapInfo(entry, group);

    let remaining = needTicks;

    info.gaps.forEach(gap => {

        if(remaining <= 0) return;

        const take = Math.min(gap.ticks, remaining);

        if(take <= 0) return;

        if(take >= gap.ticks){
            gap.el.remove();
        }
        else{
            const left = gap.ticks - take;

            setChildText(gap.el, "duration", left);

            if(gap.type === "rest"){
                updateNoteType(gap.el, left / divisions);
            }
        }

        remaining -= take;
    });

    remaining -= Math.min(remaining, info.trailingTicks);

    return needTicks - Math.max(0, remaining);
}

/* 缩短时在音符后面补等长休止符，保证后续音符位置不变 */

export function insertRestsAfterGroup(entry, group, ticks){

    if(ticks <= 0) return;

    const divisions = entry.divisions || 1;
    const last = group[group.length - 1];
    const parent = last.parentElement;

    let anchor = last.nextElementSibling;
    let base = null;

    for(let el = last.nextElementSibling; el; el = el.nextElementSibling){

        if(el.tagName === "note"){

            if(hasDirectChild(el, "grace")){
                anchor = el;
                break;
            }

            if(hasDirectChild(el, "chord")) continue;

            if(hasDirectChild(el, "rest")){
                base = el;
                anchor = el.nextElementSibling;
            }
            else{
                anchor = el;
            }

            break;
        }

        if(el.tagName === "forward"){
            base = el;
            anchor = el.nextElementSibling;
            break;
        }

        if(el.tagName === "backup"){
            anchor = el;
            break;
        }
    }

    if(base){
        ticks +=
            parseInt(directChild(base, "duration")?.textContent, 10) || 0;

        base.remove();
    }

    const insertBeforeEl = anchor || null;

    splitTicksIntoNotatable(ticks, divisions).forEach(pieceTicks => {

        const rest = createRestNote(
            group[0],
            pieceTicks,
            pieceTicks / divisions
        );

        parent.insertBefore(rest, insertBeforeEl);
    });
}

/*
    修改一个音符（和弦按整组）的时值，同时保持同声部后续音符的绝对位置：
    - 加长：占用后面的休止符 / forward / 小节尾部空白
    - 缩短：立刻在音符后补等长休止符
*/

export function setEntryDuration(entry, requestedQ){

    const divisions = entry.divisions || 1;
    const group = chordGroupFor(entry.noteEl);

    if(!group.length) return entry.durQ;

    const lead = group[0];

    const currentTicks =
        parseInt(directChild(lead, "duration")?.textContent, 10) || 0;

    if(currentTicks <= 0) return entry.durQ;

    const spanTicks = Math.max(
        1,
        Math.round(entry.measureSpanQ * divisions)
    );

    const measureLimit = Math.max(
        currentTicks,
        spanTicks - Math.round(entry.startQ * divisions)
    );

    const maxTicks = Math.min(
        measureLimit,
        currentTicks + availableLengthenTicks(entry, group)
    );

    let targetTicks = clamp(
        Math.round(requestedQ * divisions),
        1,
        Math.max(1, maxTicks)
    );

    if(targetTicks === currentTicks) return entry.durQ;

    const backupTargets = backupTargetsFor(
        entry.measureEl,
        divisions
    );

    if(targetTicks > currentTicks){

        const consumed = consumeFollowingGap(
            entry,
            group,
            targetTicks - currentTicks
        );

        targetTicks = currentTicks + consumed;
    }
    else{
        insertRestsAfterGroup(
            entry,
            group,
            currentTicks - targetTicks
        );
    }

    if(targetTicks === currentTicks) return entry.durQ;

    group.forEach(noteEl => {

        const durationEl = directChild(noteEl, "duration");
        if(!durationEl) return;

        durationEl.textContent = String(targetTicks);

        updateNoteType(noteEl, targetTicks / divisions);
    });

    normalizeMeasure(
        entry.measureEl,
        divisions,
        entry.nominalQ,
        entry.isPickup,
        backupTargets
    );

    return targetTicks / divisions;
}

export function applyDurationToXmlNote(entry, requestedQ, gridQ = 0.5){

    const grid = Math.max(0.03125, gridQ || 0.5);

    const minQ = Math.min(entry.durQ, grid);

    const maxQ = Math.max(minQ, maxDurationForEntry(entry));

    const clamped = snapNotatedDuration(
        Math.max(minQ, Math.min(requestedQ, maxQ)),
        minQ,
        maxQ,
        grid,
        entry.durQ
    );

    return setEntryDuration(entry, clamped);
}

export function createRestNote(sourceNoteEl, ticks, durQ){

    const doc = sourceNoteEl.ownerDocument;
    const noteEl = doc.createElement("note");

    noteEl.appendChild(doc.createElement("rest"));

    const durationEl = doc.createElement("duration");
    durationEl.textContent = String(Math.max(1, Math.round(ticks)));
    noteEl.appendChild(durationEl);

    const voice = childText(sourceNoteEl, "voice") || "1";
    const staff = childText(sourceNoteEl, "staff") || "1";

    const voiceEl = doc.createElement("voice");
    voiceEl.textContent = voice;
    noteEl.appendChild(voiceEl);

    const staffEl = doc.createElement("staff");
    staffEl.textContent = staff;
    noteEl.appendChild(staffEl);

    updateNoteType(noteEl, durQ);

    return noteEl;
}

export function guessProgram(name){

    for(const [re, program] of NAME_HINTS){

        if(re.test(name)) return program;
    }

    return 0;
}

export function baseFileName(name){

    return (name || "score")
        .replace(/\.(musicxml|xml|mxl)$/i, "")
        .replace(/[\\/:*?"<>|]+/g, "_") || "score";
}

export function serializeMusicXml(doc, clean=false){

    let target = doc;

    if(clean){
        target = doc.cloneNode(true);
        target.querySelectorAll("[data-musikoo-fill]").forEach(el => {
            el.removeAttribute("data-musikoo-fill");
        });
    }

    let body = new XMLSerializer().serializeToString(target);

    body = body.replace(/^\s*<\?xml[^>]*\?>\s*/, "");

    return '<?xml version="1.0" encoding="UTF-8"?>\n' + body;
}

export function findGraphicXmlEntry(model, graphic){

    const key =
        `${graphic.mi}|${graphic.partIndex}|${graphic.staff}|` +
        `${graphic.voice}|${Math.round(graphic.q * 10000)}|${graphic.midi}`;

    const exact = model.noteMap.get(key);

    if(exact){
        const hit = exact.find(e => !e._used);
        if(hit) return hit;
    }

    return model.entries.find(e =>
        !e._used &&
        e.mi === graphic.mi &&
        e.partIndex === graphic.partIndex &&
        e.staff === graphic.staff &&
        e.voice === graphic.voice &&
        Math.abs(e.startQ - graphic.q) < 0.02 &&
        e.midi === graphic.midi
    ) || null;
}

export function graphicPartIndex(osmdInstance, instrument, fallback){

    const instruments = osmdInstance?.Sheet?.Instruments;

    if(instruments){
        const idx = instruments.indexOf(instrument);
        if(idx >= 0) return idx;
    }

    if(Number.isFinite(instrument?.Id)) return instrument.Id;

    return fallback;
}

export function measureBoxInContainer(pos, osmdInstance, container){

    const svg = container.querySelector("svg");
    if(!svg || !pos) return null;

    const ctm = svg.getScreenCTM();
    const rect = container.getBoundingClientRect();

    const scaleX = Math.hypot(ctm.a, ctm.b);
    const scaleY = Math.hypot(ctm.c, ctm.d);

    return {
        left: ctm.a * pos.x + ctm.c * pos.y + ctm.e - rect.left,
        top: ctm.b * pos.x + ctm.d * pos.y + ctm.f - rect.top,
        width: pos.w * scaleX,
        height: pos.h * scaleY
    };
}

export function measurePxPerQ(entry, map, osmdInstance, container){

    const pos = map[entry.mi];
    if(!pos) return 32;

    const box = measureBoxInContainer(pos, osmdInstance, container);
    if(!box) return 32;

    const span =
        entry.isPickup
            ? Math.max(0.25, entry.measureSpanQ || entry.voiceTotalQ)
            : Math.max(0.25, entry.nominalQ);

    return box.width / span;
}

export function buildMeasurePosMapFrom(osmdInstance){

    const map = [];

    try{

        const ml = osmdInstance?.GraphicSheet?.MeasureList || [];

        ml.forEach((staffMeasures, idx) => {

            const boxes = staffMeasures
                .map(sm => sm && sm.PositionAndShape)
                .filter(Boolean);

            if(!boxes.length) return;

            const x0 = Math.min(
                ...boxes.map(b => b.AbsolutePosition.x * 10)
            );

            const y0 = Math.min(
                ...boxes.map(b => b.AbsolutePosition.y * 10)
            );

            const x1 = Math.max(
                ...boxes.map(
                    b => b.AbsolutePosition.x * 10 + b.Size.width * 10
                )
            );

            const y1 = Math.max(
                ...boxes.map(
                    b => b.AbsolutePosition.y * 10 + b.Size.height * 10
                )
            );

            map[idx] = { x:x0, y:y0, w:x1 - x0, h:y1 - y0 };
        });

    }catch(e){
        console.warn(e);
    }

    return map;
}

export function osmdPointToContainer(osmdInstance, container, x, y){

    const svg = container.querySelector("svg");
    if(!svg) return null;

    const ctm = svg.getScreenCTM();
    const rect = container.getBoundingClientRect();

    return {
        x: ctm.a * x + ctm.c * y + ctm.e - rect.left,
        y: ctm.b * x + ctm.d * y + ctm.f - rect.top
    };
}

export function updateScoreState(mEl, state){

    directChildren(mEl, "attributes").forEach(a => {

        const d = directChild(a, "divisions");
        if(d) state.divisions = parseInt(d.textContent, 10) || state.divisions;

        const key = directChild(a, "key");
        if(key){
            const fifths = childText(key, "fifths");
            if(fifths !== "") state.fifths = parseInt(fifths, 10);
        }

        const time = directChild(a, "time");
        if(time){
            const b = childText(time, "beats");
            const bt = childText(time, "beat-type");
            if(b) state.beats = parseInt(b, 10) || state.beats;
            if(bt) state.beatType = parseInt(bt, 10) || state.beatType;
        }

        const staves = directChild(a, "staves");
        if(staves){
            state.staves = parseInt(staves.textContent, 10) || state.staves;
        }

        directChildren(a, "clef").forEach(clef => {

            const number = parseInt(clef.getAttribute("number") || "1", 10);

            state.clefs[number] = {
                sign: childText(clef, "sign") || "G",
                line: childText(clef, "line") || "2"
            };
        });
    });

    const sound = mEl.querySelector("sound[tempo]");
    if(sound){
        const tempo = parseFloat(sound.getAttribute("tempo"));
        if(tempo > 0) state.tempo = tempo;
    }
}

export function stateXml(state, staffNo){

    const clef = state.clefs[staffNo] || {
        sign: staffNo === 1 ? "G" : "F",
        line: staffNo === 1 ? "2" : "4"
    };

    return (
        "<attributes>" +
        `<divisions>${state.divisions}</divisions>` +
        `<key><fifths>${state.fifths}</fifths></key>` +
        `<time><beats>${state.beats}</beats>` +
        `<beat-type>${state.beatType}</beat-type></time>` +
        `<clef><sign>${xmlEscapeText(clef.sign)}</sign>` +
        `<line>${xmlEscapeText(clef.line)}</line></clef>` +
        "</attributes>"
    );
}

export function sanitizeSnippetNote(noteEl){

    const clone = noteEl.cloneNode(true);

    const strip = el => {

        [
            "default-x", "default-y", "relative-x", "relative-y"
        ].forEach(attr => el.removeAttribute(attr));

        Array.from(el.children).forEach(strip);
    };

    strip(clone);

    setChildText(clone, "staff", "1");
    setChildText(clone, "voice", "1");

    return new XMLSerializer().serializeToString(clone);
}

/*
    片段只截取整首曲谱中的一段，跨过片段边界的连音线 / 延音线
    会缺少另一端的 start 或 stop。这里按出现顺序配对，
    去掉起点之前没有 start 的 stop，以及结尾仍未闭合的 start。
*/

export function cleanSnippetSpanners(doc){

    const notes = Array.from(doc.querySelectorAll("part > measure > note"));

    const openTies = [];
    const openTied = [];
    const openSlurs = new Map();

    notes.forEach(noteEl => {

        Array.from(noteEl.children).forEach(el => {

            if(el.tagName !== "tie") return;

            const type = el.getAttribute("type");

            if(type === "start"){
                openTies.push(el);
            }else if(type === "stop"){
                if(openTies.length){
                    openTies.pop();
                }else{
                    el.remove();
                }
            }
        });

        Array.from(noteEl.querySelectorAll("notations > tied")).forEach(el => {

            const type = el.getAttribute("type");

            if(type === "start"){
                openTied.push(el);
            }else if(type === "stop"){
                if(openTied.length){
                    openTied.pop();
                }else{
                    el.remove();
                }
            }
        });

        Array.from(noteEl.querySelectorAll("notations > slur")).forEach(el => {

            const number = el.getAttribute("number") || "1";
            const type = el.getAttribute("type");

            if(type === "start"){
                openSlurs.set(number, el);
            }else if(type === "stop"){
                if(openSlurs.has(number)){
                    openSlurs.delete(number);
                }else{
                    el.remove();
                }
            }
        });
    });

    openTies.forEach(el => el.remove());
    openTied.forEach(el => el.remove());
    openSlurs.forEach(el => el.remove());

    doc.querySelectorAll("notations").forEach(el => {
        if(!el.children.length) el.remove();
    });
}

export function buildVoiceSnippetXml(doc, partIndex, staffNo, voiceId, fromIdx, toIdx, options = {}){

    const structure = sourceStructure(doc);
    const info = structure.parts[partIndex];

    if(!info) throw new Error("找不到所选声部");

    const measureEls = directChildren(info.partEl, "measure");

    if(!measureEls.length) throw new Error("所选声部没有小节");

    const start = Math.max(0, fromIdx);
    const end = Math.min(toIdx, measureEls.length - 1);

    if(start > end) throw new Error("小节范围不正确");

    const state = {
        divisions:1,
        beats:4,
        beatType:4,
        fifths:0,
        staves:info.staves,
        clefs:{},
        tempo:null
    };

    let previousAttrs = null;
    let outputMeasures = [];
    let noteCount = 0;
    let tempoWritten = false;

    for(let mi = 0; mi < measureEls.length; mi++){

        const mEl = measureEls[mi];

        updateScoreState(mEl, state);

        if(mi < start || mi > end) continue;

        const { events, divisions, maxEndQ } =
            collectVoiceEvents(mEl, state, staffNo, voiceId);

        const nominalQ = state.beats * (4 / state.beatType);
        const isPickup =
            mi === 0 && maxEndQ > 0 && maxEndQ < nominalQ;

        const attrs = stateXml(state, staffNo);

        const number =
            mEl.getAttribute("number") || String(mi + 1);

        let body = "";

        if(attrs !== previousAttrs){
            body += attrs;
            previousAttrs = attrs;
        }

        if(!tempoWritten && state.tempo){
            body +=
                `<direction placement="above">` +
                `<direction-type><words>♩ = ${state.tempo}</words></direction-type>` +
                `<sound tempo="${state.tempo}"/>` +
                `</direction>`;
            tempoWritten = true;
        }

        let cursorTicks = 0;

        events.forEach(ev => {

            const startTicks = Math.round(ev.q * divisions);

            if(startTicks > cursorTicks){
                body +=
                    `<forward><duration>${startTicks - cursorTicks}` +
                    `</duration></forward>`;
            }

            let els = ev.els;

            /*
                自动主旋律抽取时只保留同一时刻的最高音，
                把和弦 / 双音压成单声部旋律。
            */
            if(options.topOnly && !ev.isRest && !ev.isGrace && els.length > 1){

                els = [els.reduce((best, el) => {

                    const bp = directChild(best, "pitch");
                    const cp = directChild(el, "pitch");

                    if(!bp) return el;
                    if(!cp) return best;

                    return pitchToMidi(cp) > pitchToMidi(bp) ? el : best;

                }, els[0])];

                /* 被选中的和弦音要变回主音，否则片段会以 <chord/> 开头 */
                directChild(els[0], "chord")?.remove();
            }

            els.forEach(el => {

                body += sanitizeSnippetNote(el);

                if(!ev.isRest && !ev.isGrace && directChild(el, "pitch")){
                    noteCount++;
                }
            });

            if(!ev.isGrace){
                cursorTicks = startTicks + Math.round(ev.durQ * divisions);
            }
        });

        const nominalTicks = Math.round(nominalQ * divisions);

        if(!isPickup && cursorTicks > 0 && cursorTicks < nominalTicks){
            body +=
                `<forward><duration>${nominalTicks - cursorTicks}` +
                `</duration></forward>`;
        }

        const implicit =
            mEl.getAttribute("implicit") === "yes"
                ? ' implicit="yes"'
                : "";

        outputMeasures.push(
            `<measure number="${xmlEscapeText(number)}"${implicit}>` +
            body +
            `</measure>`
        );
    }

    if(!outputMeasures.length){
        throw new Error("所选范围内没有音符");
    }

    const partName =
        `${info.name} · 谱表${staffNo} · 声部${voiceId}`;

    const program = clamp(info.program + 1, 1, 128);

    const xml =
        '<?xml version="1.0" encoding="UTF-8"?>\n' +
        '<score-partwise version="3.1">' +
        '<part-list><score-part id="P1">' +
        `<part-name>${xmlEscapeText(partName)}</part-name>` +
        '<score-instrument id="P1-I1">' +
        '<instrument-name>Melody</instrument-name>' +
        '</score-instrument>' +
        '<midi-instrument id="P1-I1">' +
        '<midi-channel>1</midi-channel>' +
        `<midi-program>${program}</midi-program>` +
        '</midi-instrument>' +
        '</score-part></part-list>' +
        '<part id="P1">' +
        outputMeasures.join("") +
        '</part></score-partwise>';

    const cleanedDoc = new DOMParser().parseFromString(
        xml,
        "application/xml"
    );

    cleanSnippetSpanners(cleanedDoc);

    return {
        xml: serializeMusicXml(cleanedDoc),
        measureCount: outputMeasures.length,
        noteCount,
        fromIdx:start,
        toIdx:end,
        partIndex,
        staff:staffNo,
        voice:voiceId,
        partName:info.name,
        topOnly: !!options.topOnly
    };
}

export function downloadXml(filename, xml){

    const blob = new Blob(
        [xml],
        { type:"application/vnd.recordare.musicxml+xml;charset=utf-8" }
    );

    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = filename;

    document.body.appendChild(a);
    a.click();
    a.remove();

    setTimeout(() => URL.revokeObjectURL(url), 1500);
}

/* ---------------- 共享导航 ---------------- */

export const FEATURES = [
    { href:"play.html",   icon:"🏠", label:"功能首页", desc:"所有功能入口" },
    { href:"player.html", icon:"▶",  label:"播放器",   desc:"载入并播放 MusicXML" },
    { href:"edit.html",   icon:"✏️", label:"谱面编辑", desc:"全谱音符编辑" },
    { href:"extract.html",icon:"🎯", label:"歌眼抽取", desc:"声部片段与主旋律" },
    { href:"new.html",    icon:"✨", label:"新建曲谱", desc:"从零构建并保存" }
];

let navStyleInjected = false;

function injectNavStyle(){

    if(navStyleInjected) return;

    navStyleInjected = true;

    const style = document.createElement("style");

    style.textContent = `
        .feature-nav{
            display:flex;
            flex-wrap:wrap;
            align-items:center;
            gap:4px;
            padding:4px;
            border:1px solid #dde6ef;
            border-radius:999px;
            background:#f2f7fc;
        }
        .feature-nav a{
            display:inline-flex;
            align-items:center;
            gap:5px;
            padding:6px 11px;
            border-radius:999px;
            color:#3c4f66;
            font-size:.78rem;
            font-weight:600;
            text-decoration:none;
            white-space:nowrap;
            transition:background .15s ease, color .15s ease;
        }
        .feature-nav a:hover{
            background:#e1ecf8;
            color:#16324f;
        }
        .feature-nav a.active{
            background:#2f5f9e;
            color:#fff;
            box-shadow:0 3px 8px rgba(47,95,158,.25);
        }
        @media (max-width:700px){
            .feature-nav{
                border-radius:16px;
            }
            .feature-nav a{
                padding:5px 8px;
            }
        }
    `;

    document.head.appendChild(style);
}

export function initFeatureNav(activeHref = null){

    const nav = document.getElementById("featureNav");

    if(!nav) return;

    injectNavStyle();

    const current =
        activeHref ||
        (location.pathname.split("/").pop() || "play.html");

    nav.innerHTML = "";

    FEATURES.forEach(feature => {

        const a = document.createElement("a");

        a.href = "./" + feature.href;
        a.textContent = `${feature.icon} ${feature.label}`;
        a.title = feature.desc;

        if(feature.href === current){
            a.classList.add("active");
            a.setAttribute("aria-current", "page");
        }

        nav.appendChild(a);
    });
}

/* ---------------- 自动主旋律抽取 ---------------- */

const MELODY_NAME_HINTS = [
    /melody|lead|solo|vocal|voice|soprano|主旋律|旋律|歌|唱|人声/i,
    /flute|piccolo|violin|oboe|clarinet|trumpet|长笛|短笛|小提琴|双簧管|单簧管|小号/i,
    /right\s*hand|rh\b|右手/i
];

const BASS_NAME_HINTS = [
    /bass|低音|tuba|contrabass|cello|大号|低音提琴|大提琴/i,
    /left\s*hand|lh\b|左手|accompan|伴奏/i,
    /drum|percussion|鼓|打击/i
];

function hintScore(name){

    let score = 0;
    const reasons = [];

    if(MELODY_NAME_HINTS.some(re => re.test(name))){
        score += 55;
        reasons.push("声部名称像主旋律");
    }

    if(BASS_NAME_HINTS.some(re => re.test(name))){
        score -= 45;
        reasons.push("声部名称像低音/伴奏");
    }

    return { score, reasons };
}

/*
    扫描整份曲谱，按“声部 + 谱表 + 声部线”统计音域、密度、和弦比例，
    给出主旋律候选排序。只是启发式，最终仍允许用户手动改选。
*/
export function analyzeMelodyVoices(doc){

    const structure = sourceStructure(doc);
    const candidates = [];

    structure.parts.forEach((partInfo, partIndex) => {

        const measureEls = directChildren(partInfo.partEl, "measure");

        const state = {
            divisions:1,
            beats:4,
            beatType:4,
            fifths:0,
            staves:partInfo.staves,
            clefs:{},
            tempo:null
        };

        const voices = new Map();

        const ensureVoice = (staff, voice) => {

            const key = `${staff}|${voice}`;

            if(!voices.has(key)){
                voices.set(key, {
                    partIndex,
                    staff,
                    voice,
                    name:partInfo.name,
                    measureCount:partInfo.measureCount,
                    onsetCount:0,
                    pitchedCount:0,
                    chordOnsets:0,
                    soundingQ:0,
                    spanQ:0,
                    topPitches:[],
                    firstMeasure:null,
                    lastMeasure:null
                });
            }

            return voices.get(key);
        };

        measureEls.forEach((mEl, mi) => {

            updateScoreState(mEl, state);

            const measureVoices = new Set();

            Array.from(mEl.children).forEach(el => {

                if(el.tagName !== "note") return;

                if(hasDirectChild(el, "rest")) return;
                if(hasDirectChild(el, "grace")) return;

                const staff = childText(el, "staff") || "1";
                const voice = childText(el, "voice") || "1";

                measureVoices.add(`${staff}|${voice}`);
            });

            const nominalQ = state.beats * (4 / state.beatType);

            measureVoices.forEach(key => {

                const [staffText, voice] = key.split("|");

                const staff = parseInt(staffText, 10) || 1;

                const info = ensureVoice(staff, voice);

                const { events } = collectVoiceEvents(
                    mEl,
                    state,
                    staff,
                    voice
                );

                info.spanQ += nominalQ;

                let hasPitch = false;

                events.forEach(ev => {

                    if(ev.isRest || ev.isGrace) return;

                    const pitches = ev.els
                        .map(el => directChild(el, "pitch"))
                        .filter(Boolean)
                        .map(pitchToMidi);

                    if(!pitches.length) return;

                    hasPitch = true;

                    info.onsetCount++;
                    info.pitchedCount += pitches.length;
                    info.soundingQ += ev.durQ;
                    info.topPitches.push(Math.max(...pitches));

                    if(pitches.length > 1) info.chordOnsets++;
                });

                if(hasPitch){
                    if(info.firstMeasure == null) info.firstMeasure = mi;
                    info.lastMeasure = mi;
                }
            });
        });

        voices.forEach(info => {

            if(!info.onsetCount) return;

            const avgMidi =
                info.topPitches.reduce((a, b) => a + b, 0) /
                info.topPitches.length;

            const density =
                info.spanQ > 0 ? info.soundingQ / info.spanQ : 0;

            const chordRatio = info.onsetCount
                ? info.chordOnsets / info.onsetCount
                : 0;

            const nameHint = hintScore(info.name);
            const reasons = [...nameHint.reasons];

            let score = nameHint.score;

            if(String(info.staff) === "1"){
                score += 9;
                reasons.push("谱表 1");
            }else{
                score -= (info.staff - 1) * 5;
            }

            if(String(info.voice) === "1"){
                score += 5;
            }

            /* 旋律通常位于中高音区 */
            score += (avgMidi - 58) * 0.9;

            if(avgMidi >= 60 && avgMidi <= 88){
                score += 8;
                reasons.push("音区适合旋律");
            }

            score += density * 35;
            score += Math.min(30, info.onsetCount * 0.08);
            score -= chordRatio * 18;

            if(partIndex === 0) score += 4;

            if(info.lastMeasure != null){
                reasons.push(
                    `第 ${info.firstMeasure + 1}–${info.lastMeasure + 1} 小节有音符`
                );
            }

            candidates.push({
                ...info,
                avgMidi,
                density,
                chordRatio,
                score: Math.round(score * 100) / 100,
                reasons
            });
        });
    });

    candidates.sort((a, b) => b.score - a.score);

    return {
        candidates,
        best: candidates[0] || null,
        measureCount: structure.measureCount,
        structure
    };
}

export function melodyRangeFor(candidate, measureCount){

    if(!candidate) return { fromIdx:0, toIdx:Math.max(0, measureCount - 1) };

    return {
        fromIdx: candidate.firstMeasure ?? 0,
        toIdx: candidate.lastMeasure ?? Math.max(0, measureCount - 1)
    };
}

/* ---------------- MIDI ↔ 音名 ---------------- */

const SHARP_NAMES = [
    "C","C#","D","D#","E","F","F#","G","G#","A","A#","B"
];

const FLAT_NAMES = [
    "C","Db","D","Eb","E","F","Gb","G","Ab","A","Bb","B"
];

export function midiToPitchParts(midi, preferFlats=false){

    const m = Math.round(clamp(midi, 0, 127));

    const names = preferFlats ? FLAT_NAMES : SHARP_NAMES;
    const name = names[((m % 12) + 12) % 12];

    const sharp = name.indexOf("#");
    const flat  = name.indexOf("b");

    return {
        step: name[0],
        alter: sharp >= 0 ? 1 : (flat >= 0 ? -1 : 0),
        octave: Math.floor(m / 12) - 1
    };
}

export function midiPitchName(midi, preferFlats=false){

    const m = Math.round(clamp(midi, 0, 127));
    const names = preferFlats ? FLAT_NAMES : SHARP_NAMES;

    return names[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1);
}

export function keyFifthsLabel(fifths){

    const major = {
        "-7":"Cb 大调", "-6":"Gb 大调", "-5":"Db 大调", "-4":"Ab 大调",
        "-3":"Eb 大调", "-2":"Bb 大调", "-1":"F 大调", "0":"C 大调",
        "1":"G 大调", "2":"D 大调", "3":"A 大调", "4":"E 大调",
        "5":"B 大调", "6":"F# 大调", "7":"C# 大调"
    };

    return major[String(fifths)] || "C 大调";
}
