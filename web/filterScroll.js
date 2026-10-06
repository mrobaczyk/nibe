// Przewijanie paska filtrów kółkiem myszy i przeciąganiem.
export function setupFilterScroll(slider) {
    if (!slider) return;

    let isDown = false;
    let startX;
    let scrollLeft;

    slider.addEventListener('wheel', (e) => {
        if (e.deltaY !== 0) {
            e.preventDefault();
            slider.scrollLeft += e.deltaY;
        }
    });

    slider.addEventListener('mousedown', (e) => {
        isDown = true;
        startX = e.pageX - slider.offsetLeft;
        scrollLeft = slider.scrollLeft;
        slider.style.cursor = 'grabbing';
    });

    const stopDrag = () => {
        isDown = false;
        slider.style.cursor = 'grab';
    };
    slider.addEventListener('mouseleave', stopDrag);
    slider.addEventListener('mouseup', stopDrag);

    slider.addEventListener('mousemove', (e) => {
        if (!isDown) return;
        e.preventDefault();
        const x = e.pageX - slider.offsetLeft;
        const walk = (x - startX) * 2;
        slider.scrollLeft = scrollLeft - walk;
    });
}
