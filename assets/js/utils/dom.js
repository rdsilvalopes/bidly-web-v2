
/* Bidly • utils/dom */
window.Bidly = window.Bidly || {};
Bidly.dom = {
  $: (sel, ctx=document)=>ctx.querySelector(sel),
  $$: (sel, ctx=document)=>Array.from(ctx.querySelectorAll(sel)),
  show(el){ el && el.classList.remove("hide"); },
  hide(el){ el && el.classList.add("hide"); },
  setText(el, txt){ if(el) el.textContent = txt; },
};

