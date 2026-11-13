import { CANDIDATE_IMAGES } from '../core/config.js';
import { el, initials } from '../core/utils.js';

const INLINE_IMAGES = (window.APRP_INLINE && window.APRP_INLINE.images) || {};

export function createAvatar(name, party, className) {
  const wrapper = el('span', `avatar ${party} ${className || ''}`.trim());
  const path = CANDIDATE_IMAGES[name];
  const source = path ? INLINE_IMAGES[path] || encodeURI(path) : null;
  const fallback = () => {
    wrapper.textContent = initials(name);
    wrapper.classList.add('avatar-initials');
  };
  if (source) {
    const image = new Image();
    image.alt = name;
    image.addEventListener('error', () => {
      image.remove();
      fallback();
    });
    image.src = source;
    wrapper.appendChild(image);
  } else {
    fallback();
  }
  return wrapper;
}

export function mountAvatar(container, name, party, className) {
  container.replaceChildren(createAvatar(name, party, className));
}

const slug = name => String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// Transparent PNG cutouts: images/cutouts/<candidate-name>.png, then images/cutouts/dem.png | gop.png
export function mountCutout(container, name, party) {
  const tries = [`images/cutouts/${slug(name)}.png`, `images/cutouts/${party}.png`];
  const image = new Image();
  image.className = 'cutout';
  image.alt = name;
  let index = 0;
  image.addEventListener('error', () => {
    index += 1;
    if (index < tries.length) {
      image.src = tries[index];
    } else {
      mountAvatar(container, name, party);
    }
  });
  image.src = tries[0];
  container.replaceChildren(image);
}
