if (!customElements.get('media-gallery')) {
  customElements.define(
    'media-gallery',
    class MediaGallery extends HTMLElement {
      constructor() {
        super();
        this.elements = {
          liveRegion: this.querySelector('[id^="GalleryStatus"]'),
          viewer: this.querySelector('[id^="GalleryViewer"]'),
          thumbnails: this.querySelector('[id^="GalleryThumbnails"]'),
        };
        this.mql = window.matchMedia('(min-width: 750px)');
        if (this.elements.viewer) {
          this.sliderButtons = this.replaceSliderButtons();
          this.counter = {
            current: this.elements.viewer.querySelector('.slider-counter--current'),
            total: this.elements.viewer.querySelector('.slider-counter--total'),
          };
          if (typeof this.elements.viewer.enableSliderLooping !== 'undefined') {
            this.elements.viewer.enableSliderLooping = true;
          }
          this.registerArrowEvents();
          this.updateCounter();
          this.elements.viewer.addEventListener('slideChanged', debounce(this.onSlideChanged.bind(this), 500));
        }

        if (this.elements.thumbnails) {
          this.elements.thumbnails.querySelectorAll('[data-target]').forEach((mediaToSwitch) => {
            mediaToSwitch
              .querySelector('button')
              .addEventListener('click', this.setActiveMedia.bind(this, mediaToSwitch.dataset.target, false));
          });
          if (this.dataset.desktopLayout.includes('thumbnail') && this.mql.matches) this.removeListSemantic();
        }
      }

      onSlideChanged(event) {
        const currentElement = event && event.detail ? event.detail.currentElement : null;
        if (!currentElement) return;

        if (this.elements.viewer) {
          this.elements.viewer
            .querySelectorAll('.slider__slide')
            .forEach((element) => element.classList.toggle('is-active', element === currentElement));
        }

        this.updateCounter(this.getSlidePositionById(currentElement.dataset.mediaId));

        if (!this.elements.thumbnails) return;

        const thumbnail = this.elements.thumbnails.querySelector(
          `[data-target="${currentElement.dataset.mediaId}"]`
        );
        this.setActiveThumbnail(thumbnail);
      }

      setActiveMedia(mediaId, prepend) {
        const activeMedia = this.elements.viewer.querySelector(`[data-media-id="${mediaId}"]`);
        this.elements.viewer.querySelectorAll('[data-media-id]').forEach((element) => {
          element.classList.remove('is-active');
        });
        activeMedia.classList.add('is-active');

        if (prepend) {
          activeMedia.parentElement.prepend(activeMedia);
          if (this.elements.thumbnails) {
            const activeThumbnail = this.elements.thumbnails.querySelector(`[data-target="${mediaId}"]`);
            activeThumbnail.parentElement.prepend(activeThumbnail);
          }
          if (this.elements.viewer.slider) this.elements.viewer.resetPages();
        }

        this.preventStickyHeader();
        window.setTimeout(() => {
          const slider = this.elements.viewer && this.elements.viewer.slider ? this.elements.viewer.slider : activeMedia.parentElement;
          if (slider && typeof slider.scrollTo === 'function') {
            slider.scrollTo({ left: activeMedia.offsetLeft, behavior: 'smooth' });
          }
          if (this.dataset.desktopLayout === 'stacked') {
            activeMedia.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          }
        });
        this.playActiveMedia(activeMedia);

        this.updateCounter(this.getSlidePositionById(mediaId));

        if (!this.elements.thumbnails) return;
        const activeThumbnail = this.elements.thumbnails.querySelector(`[data-target="${mediaId}"]`);
        this.setActiveThumbnail(activeThumbnail);
        this.announceLiveRegion(activeMedia, activeThumbnail.dataset.mediaPosition);
      }

      setActiveThumbnail(thumbnail) {
        if (!this.elements.thumbnails || !thumbnail) return;

        this.elements.thumbnails
          .querySelectorAll('button')
          .forEach((element) => element.removeAttribute('aria-current'));
        thumbnail.querySelector('button').setAttribute('aria-current', true);
        if (this.elements.thumbnails.isSlideVisible(thumbnail, 10)) return;

        this.elements.thumbnails.slider.scrollTo({ left: thumbnail.offsetLeft });
      }

      announceLiveRegion(activeItem, position) {
        const image = activeItem.querySelector('.product__modal-opener--image img');
        if (!image) return;
        image.onload = () => {
          this.elements.liveRegion.setAttribute('aria-hidden', false);
          this.elements.liveRegion.innerHTML = window.accessibilityStrings.imageAvailable.replace('[index]', position);
          setTimeout(() => {
            this.elements.liveRegion.setAttribute('aria-hidden', true);
          }, 2000);
        };
        image.src = image.src;
      }

      playActiveMedia(activeItem) {
        window.pauseAllMedia();
        const deferredMedia = activeItem.querySelector('.deferred-media');
        if (deferredMedia) deferredMedia.loadContent(false);
      }

      replaceSliderButtons() {
        if (!this.elements.viewer) {
          return { prev: null, next: null };
        }

        const replaceButton = (selector) => {
          const button = this.elements.viewer.querySelector(selector);
          if (!button || !button.parentNode) return null;
          const cloned = button.cloneNode(true);
          button.parentNode.replaceChild(cloned, button);
          return cloned;
        };

        const replacements = {
          prev: replaceButton('.slider-button--prev'),
          next: replaceButton('.slider-button--next'),
        };

        if (replacements.prev) this.elements.viewer.prevButton = replacements.prev;
        if (replacements.next) this.elements.viewer.nextButton = replacements.next;

        return replacements;
      }

      registerArrowEvents() {
        if (!this.sliderButtons) return;
        const { prev, next } = this.sliderButtons;
        if (prev) prev.addEventListener('click', this.onArrowControlClick.bind(this));
        if (next) next.addEventListener('click', this.onArrowControlClick.bind(this));
      }

      onArrowControlClick(event) {
        if (!this.elements.viewer) return;

        event.preventDefault();
        event.stopPropagation();

        const slides = this.getOrderedSlides();
        if (!slides.length) return;

        const direction = event.currentTarget && event.currentTarget.name === 'next' ? 1 : -1;
        const activeSlide = this.elements.viewer.querySelector('.slider__slide.is-active');
        const currentIndex = Math.max(
          0,
          this.getSlidePositionById(activeSlide ? activeSlide.dataset.mediaId : null, slides) - 1
        );
        let targetIndex = currentIndex + direction;

        if (targetIndex < 0) {
          targetIndex = slides.length - 1;
        } else if (targetIndex >= slides.length) {
          targetIndex = 0;
        }

        const targetSlide = slides[targetIndex];
        if (!targetSlide) return;

        this.setActiveMedia(targetSlide.dataset.mediaId, false);
        this.updateCounter(targetIndex + 1);

        if (this.sliderButtons && this.sliderButtons.prev) this.sliderButtons.prev.removeAttribute('disabled');
        if (this.sliderButtons && this.sliderButtons.next) this.sliderButtons.next.removeAttribute('disabled');
      }

      getOrderedSlides() {
        if (!this.elements.viewer) return [];
        const slides = Array.from(this.elements.viewer.querySelectorAll('.slider__slide'));
        const seen = new Set();
        return slides.filter((slide) => {
          const mediaId = slide.dataset.mediaId;
          if (!mediaId || seen.has(mediaId)) return false;
          seen.add(mediaId);
          return true;
        });
      }

      getSlidePositionById(mediaId, slides = this.getOrderedSlides()) {
        if (!slides.length) return 0;
        if (!mediaId) return 1;
        const index = slides.findIndex((slide) => slide.dataset.mediaId === mediaId);
        return index === -1 ? 1 : index + 1;
      }

      updateCounter(positionOverride) {
        if (!this.counter || !this.elements.viewer) return;

        const slides = this.getOrderedSlides();
        if (this.counter.total) {
          this.counter.total.textContent = slides.length;
        }

        if (!slides.length) return;

        const activeSlide = this.elements.viewer.querySelector('.slider__slide.is-active');
        const position =
          positionOverride ||
          this.getSlidePositionById(activeSlide ? activeSlide.dataset.mediaId : null, slides) ||
          1;

        if (this.counter.current) {
          this.counter.current.textContent = position;
        }
      }

      preventStickyHeader() {
        this.stickyHeader = this.stickyHeader || document.querySelector('sticky-header');
        if (!this.stickyHeader) return;
        this.stickyHeader.dispatchEvent(new Event('preventHeaderReveal'));
      }

      removeListSemantic() {
        if (!this.elements.viewer.slider) return;
        this.elements.viewer.slider.setAttribute('role', 'presentation');
        this.elements.viewer.sliderItems.forEach((slide) => slide.setAttribute('role', 'presentation'));
      }
    }
  );
}
