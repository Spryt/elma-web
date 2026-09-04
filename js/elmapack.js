// Elmapack data: 42 generations (26-76), 419 community levels grouped in threes.
window.EM = window.EM || {};

EM.Elmapack = (function () {
  const ELMAPACK_GENS = [
    { gen: 26, levels: ["lev/elmapack/pa26le01.lev","lev/elmapack/pa26le02.lev","lev/elmapack/pa26le03.lev","lev/elmapack/pa26le04.lev","lev/elmapack/pa26le05.lev","lev/elmapack/pa26le06.lev","lev/elmapack/pa26le07.lev","lev/elmapack/pa26le08.lev","lev/elmapack/pa26le09.lev","lev/elmapack/pa26le10.lev"] },
    { gen: 27, levels: ["lev/elmapack/pa27le01.lev","lev/elmapack/pa27le02.lev","lev/elmapack/pa27le03.lev","lev/elmapack/pa27le04.lev","lev/elmapack/pa27le05.lev","lev/elmapack/pa27le06.lev","lev/elmapack/pa27le07.lev","lev/elmapack/pa27le08.lev","lev/elmapack/pa27le09.lev","lev/elmapack/pa27le10.lev"] },
    { gen: 29, levels: ["lev/elmapack/pa29le01.lev","lev/elmapack/pa29le02.lev","lev/elmapack/pa29le03.lev","lev/elmapack/pa29le04.lev","lev/elmapack/pa29le05.lev","lev/elmapack/pa29le06.lev","lev/elmapack/pa29le07.lev","lev/elmapack/pa29le08.lev","lev/elmapack/pa29le09.lev","lev/elmapack/pa29le10.lev"] },
    { gen: 31, levels: ["lev/elmapack/pa31le01.lev","lev/elmapack/pa31le02.lev","lev/elmapack/pa31le03.lev","lev/elmapack/pa31le04.lev","lev/elmapack/pa31le05.lev","lev/elmapack/pa31le06.lev","lev/elmapack/pa31le07.lev","lev/elmapack/pa31le08.lev","lev/elmapack/pa31le09.lev","lev/elmapack/pa31le10.lev"] },
    { gen: 33, levels: ["lev/elmapack/pa33le01.lev","lev/elmapack/pa33le02.lev","lev/elmapack/pa33le03.lev","lev/elmapack/pa33le04.lev","lev/elmapack/pa33le05.lev","lev/elmapack/pa33le06.lev","lev/elmapack/pa33le07.lev","lev/elmapack/pa33le08.lev","lev/elmapack/pa33le09.lev","lev/elmapack/pa33le10.lev"] },
    { gen: 35, levels: ["lev/elmapack/pa35le01.lev","lev/elmapack/pa35le02.lev","lev/elmapack/pa35le03.lev","lev/elmapack/pa35le04.lev","lev/elmapack/pa35le05.lev","lev/elmapack/pa35le06.lev","lev/elmapack/pa35le07.lev","lev/elmapack/pa35le08.lev","lev/elmapack/pa35le09.lev","lev/elmapack/pa35le10.lev"] },
    { gen: 36, levels: ["lev/elmapack/pa36le01.lev","lev/elmapack/pa36le02.lev","lev/elmapack/pa36le03.lev","lev/elmapack/pa36le04.lev","lev/elmapack/pa36le05.lev","lev/elmapack/pa36le06.lev","lev/elmapack/pa36le07.lev","lev/elmapack/pa36le08.lev","lev/elmapack/pa36le09.lev","lev/elmapack/pa36le10.lev"] },
    { gen: 37, levels: ["lev/elmapack/pa37le01.lev","lev/elmapack/pa37le02.lev","lev/elmapack/pa37le03.lev","lev/elmapack/pa37le04.lev","lev/elmapack/pa37le05.lev","lev/elmapack/pa37le06.lev","lev/elmapack/pa37le07.lev","lev/elmapack/pa37le08.lev","lev/elmapack/pa37le09.lev","lev/elmapack/pa37le10.lev"] },
    { gen: 39, levels: ["lev/elmapack/pa39le01.lev","lev/elmapack/pa39le02.lev","lev/elmapack/pa39le03.lev","lev/elmapack/pa39le04.lev","lev/elmapack/pa39le05.lev","lev/elmapack/pa39le06.lev","lev/elmapack/pa39le07.lev","lev/elmapack/pa39le08.lev","lev/elmapack/pa39le09.lev","lev/elmapack/pa39le10.lev"] },
    { gen: 40, levels: ["lev/elmapack/pa40le01.lev","lev/elmapack/pa40le02.lev","lev/elmapack/pa40le03.lev","lev/elmapack/pa40le04.lev","lev/elmapack/pa40le05.lev","lev/elmapack/pa40le06.lev","lev/elmapack/pa40le07.lev","lev/elmapack/pa40le08.lev","lev/elmapack/pa40le09.lev","lev/elmapack/pa40le10.lev"] },
    { gen: 41, levels: ["lev/elmapack/pa41le01.lev","lev/elmapack/pa41le02.lev","lev/elmapack/pa41le03.lev","lev/elmapack/pa41le04.lev","lev/elmapack/pa41le05.lev","lev/elmapack/pa41le06.lev","lev/elmapack/pa41le07.lev","lev/elmapack/pa41le08.lev","lev/elmapack/pa41le09.lev"] },
    { gen: 42, levels: ["lev/elmapack/pa42le01.lev","lev/elmapack/pa42le02.lev","lev/elmapack/pa42le03.lev","lev/elmapack/pa42le04.lev","lev/elmapack/pa42le05.lev","lev/elmapack/pa42le06.lev","lev/elmapack/pa42le07.lev","lev/elmapack/pa42le08.lev","lev/elmapack/pa42le09.lev","lev/elmapack/pa42le10.lev"] },
    { gen: 44, levels: ["lev/elmapack/pa44le01.lev","lev/elmapack/pa44le02.lev","lev/elmapack/pa44le03.lev","lev/elmapack/pa44le04.lev","lev/elmapack/pa44le05.lev","lev/elmapack/pa44le06.lev","lev/elmapack/pa44le07.lev","lev/elmapack/pa44le08.lev","lev/elmapack/pa44le09.lev","lev/elmapack/pa44le10.lev"] },
    { gen: 45, levels: ["lev/elmapack/pa45le01.lev","lev/elmapack/pa45le02.lev","lev/elmapack/pa45le03.lev","lev/elmapack/pa45le04.lev","lev/elmapack/pa45le05.lev","lev/elmapack/pa45le06.lev","lev/elmapack/pa45le07.lev","lev/elmapack/pa45le08.lev","lev/elmapack/pa45le09.lev","lev/elmapack/pa45le10.lev"] },
    { gen: 46, levels: ["lev/elmapack/pa46le01.lev","lev/elmapack/pa46le02.lev","lev/elmapack/pa46le03.lev","lev/elmapack/pa46le04.lev","lev/elmapack/pa46le05.lev","lev/elmapack/pa46le06.lev","lev/elmapack/pa46le07.lev","lev/elmapack/pa46le08.lev","lev/elmapack/pa46le09.lev","lev/elmapack/pa46le10.lev"] },
    { gen: 47, levels: ["lev/elmapack/pa47le01.lev","lev/elmapack/pa47le02.lev","lev/elmapack/pa47le03.lev","lev/elmapack/pa47le04.lev","lev/elmapack/pa47le05.lev","lev/elmapack/pa47le06.lev","lev/elmapack/pa47le07.lev","lev/elmapack/pa47le08.lev","lev/elmapack/pa47le09.lev","lev/elmapack/pa47le10.lev"] },
    { gen: 49, levels: ["lev/elmapack/pa49le01.lev","lev/elmapack/pa49le02.lev","lev/elmapack/pa49le03.lev","lev/elmapack/pa49le04.lev","lev/elmapack/pa49le05.lev","lev/elmapack/pa49le06.lev","lev/elmapack/pa49le07.lev","lev/elmapack/pa49le08.lev","lev/elmapack/pa49le09.lev","lev/elmapack/pa49le10.lev"] },
    { gen: 50, levels: ["lev/elmapack/pa50le01.lev","lev/elmapack/pa50le02.lev","lev/elmapack/pa50le03.lev","lev/elmapack/pa50le04.lev","lev/elmapack/pa50le05.lev","lev/elmapack/pa50le06.lev","lev/elmapack/pa50le07.lev","lev/elmapack/pa50le08.lev","lev/elmapack/pa50le09.lev","lev/elmapack/pa50le10.lev"] },
    { gen: 51, levels: ["lev/elmapack/pa51le01.lev","lev/elmapack/pa51le02.lev","lev/elmapack/pa51le03.lev","lev/elmapack/pa51le04.lev","lev/elmapack/pa51le05.lev","lev/elmapack/pa51le06.lev","lev/elmapack/pa51le07.lev","lev/elmapack/pa51le08.lev","lev/elmapack/pa51le09.lev","lev/elmapack/pa51le10.lev"] },
    { gen: 52, levels: ["lev/elmapack/pa52le01.lev","lev/elmapack/pa52le02.lev","lev/elmapack/pa52le03.lev","lev/elmapack/pa52le04.lev","lev/elmapack/pa52le05.lev","lev/elmapack/pa52le06.lev","lev/elmapack/pa52le07.lev","lev/elmapack/pa52le08.lev","lev/elmapack/pa52le09.lev","lev/elmapack/pa52le10.lev"] },
    { gen: 53, levels: ["lev/elmapack/pa53le01.lev","lev/elmapack/pa53le02.lev","lev/elmapack/pa53le03.lev","lev/elmapack/pa53le04.lev","lev/elmapack/pa53le05.lev","lev/elmapack/pa53le06.lev","lev/elmapack/pa53le07.lev","lev/elmapack/pa53le08.lev","lev/elmapack/pa53le09.lev","lev/elmapack/pa53le10.lev"] },
    { gen: 54, levels: ["lev/elmapack/pa54le01.lev","lev/elmapack/pa54le02.lev","lev/elmapack/pa54le03.lev","lev/elmapack/pa54le04.lev","lev/elmapack/pa54le05.lev","lev/elmapack/pa54le06.lev","lev/elmapack/pa54le07.lev","lev/elmapack/pa54le08.lev","lev/elmapack/pa54le09.lev","lev/elmapack/pa54le10.lev"] },
    { gen: 55, levels: ["lev/elmapack/pa55le01.lev","lev/elmapack/pa55le02.lev","lev/elmapack/pa55le03.lev","lev/elmapack/pa55le04.lev","lev/elmapack/pa55le05.lev","lev/elmapack/pa55le06.lev","lev/elmapack/pa55le07.lev","lev/elmapack/pa55le08.lev","lev/elmapack/pa55le09.lev","lev/elmapack/pa55le10.lev"] },
    { gen: 57, levels: ["lev/elmapack/pa57le01.lev","lev/elmapack/pa57le02.lev","lev/elmapack/pa57le03.lev","lev/elmapack/pa57le04.lev","lev/elmapack/pa57le05.lev","lev/elmapack/pa57le06.lev","lev/elmapack/pa57le07.lev","lev/elmapack/pa57le08.lev","lev/elmapack/pa57le09.lev","lev/elmapack/pa57le10.lev"] },
    { gen: 58, levels: ["lev/elmapack/pa58le01.lev","lev/elmapack/pa58le02.lev","lev/elmapack/pa58le03.lev","lev/elmapack/pa58le04.lev","lev/elmapack/pa58le05.lev","lev/elmapack/pa58le06.lev","lev/elmapack/pa58le07.lev","lev/elmapack/pa58le08.lev","lev/elmapack/pa58le09.lev","lev/elmapack/pa58le10.lev"] },
    { gen: 59, levels: ["lev/elmapack/pa59le01.lev","lev/elmapack/pa59le02.lev","lev/elmapack/pa59le03.lev","lev/elmapack/pa59le04.lev","lev/elmapack/pa59le05.lev","lev/elmapack/pa59le06.lev","lev/elmapack/pa59le07.lev","lev/elmapack/pa59le08.lev","lev/elmapack/pa59le09.lev","lev/elmapack/pa59le10.lev"] },
    { gen: 60, levels: ["lev/elmapack/pa60le01.lev","lev/elmapack/pa60le02.lev","lev/elmapack/pa60le03.lev","lev/elmapack/pa60le04.lev","lev/elmapack/pa60le05.lev","lev/elmapack/pa60le06.lev","lev/elmapack/pa60le07.lev","lev/elmapack/pa60le08.lev","lev/elmapack/pa60le09.lev","lev/elmapack/pa60le10.lev"] },
    { gen: 61, levels: ["lev/elmapack/pa61le01.lev","lev/elmapack/pa61le02.lev","lev/elmapack/pa61le03.lev","lev/elmapack/pa61le04.lev","lev/elmapack/pa61le05.lev","lev/elmapack/pa61le06.lev","lev/elmapack/pa61le07.lev","lev/elmapack/pa61le08.lev","lev/elmapack/pa61le09.lev","lev/elmapack/pa61le10.lev"] },
    { gen: 62, levels: ["lev/elmapack/pa62le01.lev","lev/elmapack/pa62le02.lev","lev/elmapack/pa62le03.lev","lev/elmapack/pa62le04.lev","lev/elmapack/pa62le05.lev","lev/elmapack/pa62le06.lev","lev/elmapack/pa62le07.lev","lev/elmapack/pa62le08.lev","lev/elmapack/pa62le09.lev","lev/elmapack/pa62le10.lev"] },
    { gen: 63, levels: ["lev/elmapack/pa63le01.lev","lev/elmapack/pa63le02.lev","lev/elmapack/pa63le03.lev","lev/elmapack/pa63le04.lev","lev/elmapack/pa63le05.lev","lev/elmapack/pa63le06.lev","lev/elmapack/pa63le07.lev","lev/elmapack/pa63le08.lev","lev/elmapack/pa63le09.lev","lev/elmapack/pa63le10.lev"] },
    { gen: 64, levels: ["lev/elmapack/pa64le01.lev","lev/elmapack/pa64le02.lev","lev/elmapack/pa64le03.lev","lev/elmapack/pa64le04.lev","lev/elmapack/pa64le05.lev","lev/elmapack/pa64le06.lev","lev/elmapack/pa64le07.lev","lev/elmapack/pa64le08.lev","lev/elmapack/pa64le09.lev","lev/elmapack/pa64le10.lev"] },
    { gen: 65, levels: ["lev/elmapack/pa65le01.lev","lev/elmapack/pa65le02.lev","lev/elmapack/pa65le03.lev","lev/elmapack/pa65le04.lev","lev/elmapack/pa65le05.lev","lev/elmapack/pa65le06.lev","lev/elmapack/pa65le07.lev","lev/elmapack/pa65le08.lev","lev/elmapack/pa65le09.lev","lev/elmapack/pa65le10.lev"] },
    { gen: 66, levels: ["lev/elmapack/pa66le01.lev","lev/elmapack/pa66le02.lev","lev/elmapack/pa66le03.lev","lev/elmapack/pa66le04.lev","lev/elmapack/pa66le05.lev","lev/elmapack/pa66le06.lev","lev/elmapack/pa66le07.lev","lev/elmapack/pa66le08.lev","lev/elmapack/pa66le09.lev","lev/elmapack/pa66le10.lev"] },
    { gen: 67, levels: ["lev/elmapack/pa67le01.lev","lev/elmapack/pa67le02.lev","lev/elmapack/pa67le03.lev","lev/elmapack/pa67le04.lev","lev/elmapack/pa67le05.lev","lev/elmapack/pa67le06.lev","lev/elmapack/pa67le07.lev","lev/elmapack/pa67le08.lev","lev/elmapack/pa67le09.lev","lev/elmapack/pa67le10.lev"] },
    { gen: 68, levels: ["lev/elmapack/pa68le01.lev","lev/elmapack/pa68le02.lev","lev/elmapack/pa68le03.lev","lev/elmapack/pa68le04.lev","lev/elmapack/pa68le05.lev","lev/elmapack/pa68le06.lev","lev/elmapack/pa68le07.lev","lev/elmapack/pa68le08.lev","lev/elmapack/pa68le09.lev","lev/elmapack/pa68le10.lev"] },
    { gen: 69, levels: ["lev/elmapack/pa69le01.lev","lev/elmapack/pa69le02.lev","lev/elmapack/pa69le03.lev","lev/elmapack/pa69le04.lev","lev/elmapack/pa69le05.lev","lev/elmapack/pa69le06.lev","lev/elmapack/pa69le07.lev","lev/elmapack/pa69le08.lev","lev/elmapack/pa69le09.lev","lev/elmapack/pa69le10.lev"] },
    { gen: 70, levels: ["lev/elmapack/pa70le01.lev","lev/elmapack/pa70le02.lev","lev/elmapack/pa70le03.lev","lev/elmapack/pa70le04.lev","lev/elmapack/pa70le05.lev","lev/elmapack/pa70le06.lev","lev/elmapack/pa70le07.lev","lev/elmapack/pa70le08.lev","lev/elmapack/pa70le09.lev","lev/elmapack/pa70le10.lev"] },
    { gen: 71, levels: ["lev/elmapack/pa71le01.lev","lev/elmapack/pa71le02.lev","lev/elmapack/pa71le03.lev","lev/elmapack/pa71le04.lev","lev/elmapack/pa71le05.lev","lev/elmapack/pa71le06.lev","lev/elmapack/pa71le07.lev","lev/elmapack/pa71le08.lev","lev/elmapack/pa71le09.lev","lev/elmapack/pa71le10.lev"] },
    { gen: 72, levels: ["lev/elmapack/pa72le01.lev","lev/elmapack/pa72le02.lev","lev/elmapack/pa72le03.lev","lev/elmapack/pa72le04.lev","lev/elmapack/pa72le05.lev","lev/elmapack/pa72le06.lev","lev/elmapack/pa72le07.lev","lev/elmapack/pa72le08.lev","lev/elmapack/pa72le09.lev","lev/elmapack/pa72le10.lev"] },
    { gen: 74, levels: ["lev/elmapack/pa74le01.lev","lev/elmapack/pa74le02.lev","lev/elmapack/pa74le03.lev","lev/elmapack/pa74le04.lev","lev/elmapack/pa74le05.lev","lev/elmapack/pa74le06.lev","lev/elmapack/pa74le07.lev","lev/elmapack/pa74le08.lev","lev/elmapack/pa74le09.lev","lev/elmapack/pa74le10.lev"] },
    { gen: 75, levels: ["lev/elmapack/pa75le01.lev","lev/elmapack/pa75le02.lev","lev/elmapack/pa75le03.lev","lev/elmapack/pa75le04.lev","lev/elmapack/pa75le05.lev","lev/elmapack/pa75le06.lev","lev/elmapack/pa75le07.lev","lev/elmapack/pa75le08.lev","lev/elmapack/pa75le09.lev","lev/elmapack/pa75le10.lev"] },
    { gen: 76, levels: ["lev/elmapack/pa76le01.lev","lev/elmapack/pa76le02.lev","lev/elmapack/pa76le03.lev","lev/elmapack/pa76le04.lev","lev/elmapack/pa76le05.lev","lev/elmapack/pa76le06.lev","lev/elmapack/pa76le07.lev","lev/elmapack/pa76le08.lev","lev/elmapack/pa76le09.lev","lev/elmapack/pa76le10.lev"] },
  ];

  const ELMAPACK_GROUPS = [
    [26, 27, 29],
    [31, 33, 35],
    [36, 37, 39],
    [40, 41, 42],
    [44, 45, 46],
    [47, 49, 50],
    [51, 52, 53],
    [54, 55, 57],
    [58, 59, 60],
    [61, 62, 63],
    [64, 65, 66],
    [67, 68, 69],
    [70, 71, 72],
    [74, 75, 76],
  ];

  function getGen(gen) {
    return ELMAPACK_GENS.find(g => g.gen === gen);
  }

  function getGroupLevels(groupIdx) {
    const gens = ELMAPACK_GROUPS[groupIdx] || [];
    const result = [];
    for (const gen of gens) {
      const g = getGen(gen);
      if (g) result.push(...g.levels);
    }
    return result;
  }

  function getGroupGenInfo(groupIdx) {
    const gens = ELMAPACK_GROUPS[groupIdx] || [];
    const info = [];
    let startIdx = 0;
    for (const gen of gens) {
      const g = getGen(gen);
      if (g) {
        info.push({ gen, startIdx, count: g.levels.length });
        startIdx += g.levels.length;
      }
    }
    return info;
  }

  function getGroupLabel(groupIdx) {
    const gens = ELMAPACK_GROUPS[groupIdx] || [];
    return gens.join(" · ");
  }

  function totalLevels() {
    return ELMAPACK_GENS.reduce((sum, g) => sum + g.levels.length, 0);
  }

  return { ELMAPACK_GENS, ELMAPACK_GROUPS, getGroupLevels, getGroupGenInfo, getGroupLabel, getGen, totalLevels };
})();
