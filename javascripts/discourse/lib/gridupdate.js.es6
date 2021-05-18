import loadScript from 'discourse/lib/load-script';

window.addEventListener ('resize', resizeAllGridItems);
window.addEventListener ('scroll', resizeAllGridItems);

function resizeGridItem (item, grid, rowHeight, rowGap) {
  loadScript (
    'https://www.rivoq.com/uploads/default/assets/imagesloaded.pkgd.min.js'
  ).then (() => {
    imagesLoaded (item, function () {
      const contentHeight = item.childNodes[1].getBoundingClientRect ().height;
      const rowSpan = Math.ceil (
        (contentHeight + rowGap) / (rowHeight + rowGap)
      );
      item.style.gridRowEnd = 'span ' + rowSpan;
    });
  });
}

function resizeAllGridItems () {
  const allItems = document.getElementsByClassName ('tiles-grid-item');
  const grid = document.getElementsByClassName ('tiles-grid')[0];
  if (!grid) {
    return;
  }
  const rowHeight = parseInt (
    window.getComputedStyle (grid).getPropertyValue ('grid-auto-rows')
  );
  const rowGap = parseInt (
    window.getComputedStyle (grid).getPropertyValue ('grid-row-gap')
  );
  for (var x = 0; x < allItems.length; x++) {
    resizeGridItem (allItems[x], grid, rowHeight, rowGap);
  }
}

export {resizeAllGridItems};
