import { el, initials } from '../core/utils.js';

const images = new Map();

export function setCandidateImages(entries) {
  images.clear();
  Object.keys(entries).forEach(name => {
    if (name && entries[name]) {
      images.set(name, entries[name]);
    }
  });
}

export function createAvatar(name, party, className) {
  const wrapper = el('span', `avatar ${party} ${className || ''}`.trim());
  const source = images.get(name) || null;
  const fallback = () => {
    wrapper.textContent = initials(name);
    wrapper.classList.add('avatar-initials');
  };
  if (source) {
    const image = new Image();
    image.alt = name;
    image.referrerPolicy = 'no-referrer';
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

export function mountCutout(container, name, party) {
  if (images.has(name)) {
    mountAvatar(container, name, party);
    return;
  }
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
