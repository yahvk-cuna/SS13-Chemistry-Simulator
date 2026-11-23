import type { SimContext } from './types';

/**
 * In-body instant chemical reactions matching Tianguan13's recipes/pyrotechnics.dm and food_mixtures.dm.
 */
export function runInBodyReactions(ctx: SimContext): void {
  const { state } = ctx;

  // Penthrite + Epinephrine explosion (pyrotechnics.dm:149)
  const penthrite = ctx.getBloodReagent('penthrite');
  const epi = ctx.getBloodReagent('epinephrine');
  if (penthrite && epi && penthrite.volume >= 1 && epi.volume >= 1) {
    const mult = Math.min(penthrite.volume, epi.volume);
    ctx.removeBloodReagent('penthrite', mult);
    ctx.removeBloodReagent('epinephrine', mult);
    // Clear all blood reagents (clear_mob_reagents = TRUE)
    for (const r of [...state.blood]) {
      ctx.removeBloodReagent(r.id, r.volume);
    }
    const bruteDmg = Math.min(130, 22 + mult * 3.8);
    const burnDmg = Math.min(90, 14 + mult * 2.2);
    state.brute += bruteDmg;
    state.burn += burnDmg;
    ctx.addEvent(
      'danger',
      'reaction',
      '体内化学爆炸：彭斯莱特 + 肾上腺素',
      `反应量 ${mult.toFixed(1)}u（强度除数 5），造成 ${bruteDmg.toFixed(1)} 钝伤 + ${burnDmg.toFixed(1)} 烧伤，并清空血液中所有试剂！`,
    );
    return;
  }

  // Penthrite + Atropine explosion (pyrotechnics.dm:157, modifier = 5)
  const atro = ctx.getBloodReagent('atropine');
  if (penthrite && atro && penthrite.volume >= 1 && atro.volume >= 1) {
    const mult = Math.min(penthrite.volume, atro.volume);
    ctx.removeBloodReagent('penthrite', mult);
    ctx.removeBloodReagent('atropine', mult);
    for (const r of [...state.blood]) {
      ctx.removeBloodReagent(r.id, r.volume);
    }
    const bruteDmg = Math.min(150, 36 + mult * 4.2);
    const burnDmg = Math.min(110, 22 + mult * 2.6);
    state.brute += bruteDmg;
    state.burn += burnDmg;
    ctx.addEvent(
      'danger',
      'reaction',
      '体内剧烈爆炸：彭斯莱特 + 阿托品',
      `反应量 ${mult.toFixed(1)}u（强度除数 5, 修正 +5），造成 ${bruteDmg.toFixed(1)} 钝伤 + ${burnDmg.toFixed(1)} 烧伤，并清空血液中所有试剂！`,
    );
    return;
  }

  // Mitogen Metabolism Factor (catalyst >= 0.5u) + Nutriment (>= 0.5u) -> Peptides (food_mixtures.dm:249)
  const metafactor = ctx.getBloodReagent('metafactor');
  const nutriment = ctx.getBloodReagent('nutriment');
  if (metafactor && metafactor.volume >= 0.5 && nutriment && nutriment.volume >= 0.5) {
    const steps = Math.floor(nutriment.volume / 0.5);
    const converted = steps * 0.5;
    if (converted > 0) {
      const avgPurity = (metafactor.purity + nutriment.purity) / 2;
      ctx.removeBloodReagent('nutriment', converted);
      ctx.addBloodReagent('peptides', converted, avgPurity, state.chemTemp, true);
      ctx.addEvent(
        'good',
        'reaction',
        '体内催化转化：营养物 → 治疗肽',
        `有丝分裂素代谢因子 (${metafactor.volume.toFixed(2)}u) 催化 ${converted.toFixed(1)}u 营养物转化为治疗肽。`,
      );
    }
  }

  // Metabolic Inhibition Factor (catalyst >= 0.5u) + Nutriment (>= 0.5u) -> Prion Peptides (food_mixtures.dm:259)
  const failedFactor = ctx.getBloodReagent('probital_failed');
  const nutrimentAfter = ctx.getBloodReagent('nutriment');
  if (failedFactor && failedFactor.volume >= 0.5 && nutrimentAfter && nutrimentAfter.volume >= 0.5) {
    const steps = Math.floor(nutrimentAfter.volume / 0.5);
    const converted = steps * 0.5;
    if (converted > 0) {
      ctx.removeBloodReagent('nutriment', converted);
      ctx.addBloodReagent('peptides_failed', converted, 1, state.chemTemp, true);
      ctx.addEvent(
        'danger',
        'reaction',
        '体内错误催化：营养物 → 朊病毒肽',
        `代谢抑制因子催化 ${converted.toFixed(1)}u 营养物转化为有害的朊病毒肽！`,
      );
    }
  }
}
