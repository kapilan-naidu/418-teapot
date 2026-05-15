// slides.js — slide navigation + sketch lifecycle

const slides = document.querySelectorAll(".slide");
const counter = document.getElementById("slide-counter");
let current = 0;

function goTo(index) {
  if (index < 0 || index >= slides.length) return;

  slides[current].classList.remove("active");
  current = index;
  slides[current].classList.add("active");
  counter.textContent = `${current + 1} / ${slides.length}`;

  // Update URL hash without triggering a page jump
  history.replaceState(null, null, `#slide-${current + 1}`);

  if (current === 4) {
    if (typeof sketchPrewarm === "function") sketchPrewarm();
  }
  if (current === 5) {
    if (typeof sketchStart === "function") sketchStart();
  }
}

// On load, go to slide from hash if present
const initialSlide = parseInt(location.hash.replace("#slide-", "")) - 1;
if (!isNaN(initialSlide) && initialSlide >= 0 && initialSlide < slides.length) {
  goTo(initialSlide);
}

document.getElementById("prev").addEventListener("click", () => goTo(current - 1));
document.getElementById("next").addEventListener("click", () => goTo(current + 1));

document.addEventListener("keydown", (e) => {
  if (e.key === "ArrowRight") goTo(current + 1);
  if (e.key === "ArrowLeft") goTo(current - 1);
});

// Nav visibility
let navTimeout;
const nav = document.getElementById("nav");

document.addEventListener("mousemove", () => {
  nav.classList.add("visible");
  clearTimeout(navTimeout);
  navTimeout = setTimeout(() => nav.classList.remove("visible"), 2500);
});
