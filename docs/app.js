/* Singularity Inc. site — reveal, nav, 3D tilt, parallax. Vanilla, no deps. */
(() => {
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // scroll reveal
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); }
  }, { threshold: 0.14, rootMargin: "0px 0px -8% 0px" });
  document.querySelectorAll(".reveal").forEach((el) => io.observe(el));

  // nav: condensed state on scroll
  const nav = document.getElementById("nav");
  const onScroll = () => nav && nav.classList.toggle("scrolled", window.scrollY > 12);
  onScroll(); window.addEventListener("scroll", onScroll, { passive: true });

  // mobile nav toggle
  const tgl = document.getElementById("navtoggle"), links = document.getElementById("navlinks");
  if (tgl && links) {
    const setOpen = (open) => { links.classList.toggle("open", open); tgl.setAttribute("aria-expanded", String(open)); };
    tgl.addEventListener("click", () => setOpen(!links.classList.contains("open")));
    links.addEventListener("click", (e) => { if (e.target.tagName === "A") setOpen(false); });
  }

  if (reduce) return;

  // hero: mouse-driven 3D tilt on the device + depth parallax on floating pills
  const stage = document.getElementById("stage");
  const device = document.getElementById("device");
  if (stage && device) {
    const layers = [device, ...stage.querySelectorAll(".float")];
    let tx = 0, ty = 0, cx = 0, cy = 0, raf = 0;
    const loop = () => {
      cx += (tx - cx) * 0.08; cy += (ty - cy) * 0.08;
      device.style.transform =
        `translate(-50%,-50%) rotateY(${cx * 12}deg) rotateX(${-cy * 12}deg) translateZ(0)`;
      layers.forEach((el) => {
        if (el === device) return;
        const d = parseFloat(el.dataset.depth || "20");
        el.style.transform = `translate(${cx * d}px, ${cy * d}px)`;
      });
      raf = requestAnimationFrame(loop);
      if (Math.abs(tx - cx) < 0.001 && Math.abs(ty - cy) < 0.001) { cancelAnimationFrame(raf); raf = 0; }
    };
    const kick = () => { if (!raf) raf = requestAnimationFrame(loop); };
    stage.addEventListener("mousemove", (e) => {
      const r = stage.getBoundingClientRect();
      tx = (e.clientX - (r.left + r.width / 2)) / r.width;
      ty = (e.clientY - (r.top + r.height / 2)) / r.height;
      tx = Math.max(-0.6, Math.min(0.6, tx)); ty = Math.max(-0.6, Math.min(0.6, ty));
      kick();
    }, { passive: true });
    stage.addEventListener("mouseleave", () => { tx = 0; ty = 0; kick(); });
  }

  // gallery: per-tile 3D tilt toward the cursor
  document.querySelectorAll("#tiltgallery .shot").forEach((card) => {
    card.addEventListener("mousemove", (e) => {
      const r = card.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width - 0.5;
      const py = (e.clientY - r.top) / r.height - 0.5;
      card.style.transform = `translateY(-8px) rotateY(${px * 10}deg) rotateX(${-py * 10}deg)`;
    });
    card.addEventListener("mouseleave", () => { card.style.transform = ""; });
  });
})();
