// slides.js — slide navigation + sketch lifecycle

const slides = document.querySelectorAll(".slide");
const counter = document.getElementById("slide-counter");
let current = 0;

function goTo(index) {
  if (index < 0 || index >= slides.length) return;

  // Pause sketch when leaving slides 5 or 6 (indices 4 & 5) for any other slide
  if ((current === 4 || current === 5) && index !== 4 && index !== 5) {
    if (typeof sketchPause === "function") sketchPause();
  }

  slides[current].classList.remove("active");
  current = index;
  slides[current].classList.add("active");
  counter.textContent = `${current + 1} / ${slides.length}`;

  history.replaceState(null, null, `#slide-${current + 1}`);

  // Dashboard only ever shows on slide 6 (index 5)
  if (typeof dashboard !== "undefined" && dashboard.setSlide) dashboard.setSlide(current);

  // Prewarm on slide 4 (index 3)
  if (current === 3) {
    if (typeof sketchPrewarm === "function") sketchPrewarm();
  }

  // Start (or resume) on slide 5 or 6 (indices 4 & 5)
  if (current === 4 || current === 5) {
    if (typeof sketchStart === "function") sketchStart();
  }
}

// On load, go to slide from hash if present
const initialSlide = parseInt(location.hash.replace("#slide-", "")) - 1;
if (!isNaN(initialSlide) && initialSlide >= 0 && initialSlide < slides.length) {
  goTo(initialSlide);
} else {
  // Ensure counter is correct on default load
  counter.textContent = `1 / ${slides.length}`;
}

document.getElementById("prev").addEventListener("click", () => goTo(current - 1));
document.getElementById("next").addEventListener("click", () => goTo(current + 1));

document.addEventListener("keydown", (e) => {
  if (e.key === "ArrowRight") goTo(current + 1);
  if (e.key === "ArrowLeft") goTo(current - 1);
});

// Nav visibility — show on mousemove, hide after 2.5s idle
let navTimeout;
const nav = document.getElementById("nav");

document.addEventListener("mousemove", () => {
  nav.classList.add("visible");
  clearTimeout(navTimeout);
  navTimeout = setTimeout(() => nav.classList.remove("visible"), 2500);
});
