// generateRecipeFlex.js

function generateRecipeFlex(recipe) {
  return {
    type: 'flex',
    altText: `推薦食譜：${recipe.name}`,
    contents: {
      type: 'bubble',
      size: 'mega',
      hero: {
        type: 'image',
        url: 'https://medwell-test1.web.app/photo/food.png',
        size: 'full',
        aspectRatio: '20:13',
        aspectMode: 'cover'
      },
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'md',
        contents: [
          {
            type: 'text',
            text: recipe.name,
            weight: 'bold',
            size: 'xl',
            wrap: true
          },
          {
            type: 'text',
            text: `💡 ${recipe.hint}`,
            size: 'sm',
            color: '#666666',
            wrap: true
          },
          {
            type: 'box',
            layout: 'vertical',
            spacing: 'sm',
            contents: [
              {
                type: 'text',
                text: '🍽️ 材料',
                weight: 'bold',
                size: 'md'
              },
              ...recipe.ingredients.slice(0, 3).map(item => ({
                type: 'text',
                text: `・${item}`,
                size: 'sm',
                wrap: true
              }))
            ]
          }
        ]
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        contents: [
          {
            type: 'box',
            layout: 'vertical',
            backgroundColor: '#efede9', // 小奶黃底
            cornerRadius: 'md',
            borderWidth: '1px',
            borderColor: '#588157', // 深綠框線
            action: {
              type: 'message',
              label: '查看步驟',
              text: `步驟 ${recipe.name}`
            },
            contents: [
              {
                type: 'text',
                text: '查看步驟',
                align: 'center',
                gravity: 'center',
                weight: 'bold',
                color: '#588157', // 深綠字
                size: 'md'
              }
            ],
            paddingAll: 'sm'
          }
        ]
      }
    }
  };
}

module.exports = generateRecipeFlex;
