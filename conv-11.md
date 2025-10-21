Here's an example of using the modulo operator in JavaScript, along with a simple calculator function that can perform addition, subtraction, multiplication, division, and modulo operations.

### Modulo Example and Calculator Function

```javascript
// Function to demonstrate modulo operation
const demonstrateModulo = (a, b) => {
  return a % b;
};

// Calculator function
const calculator = (num1, num2, operation) => {
  switch (operation) {
    case 'add':
      return num1 + num2;
    case 'subtract':
      return num1 - num2;
    case 'multiply':
      return num1 * num2;
    case 'divide':
      return num2 !== 0 ? num1 / num2 : 'Error: Division by zero';
    case 'modulo':
      return demonstrateModulo(num1, num2);
    default:
      return 'Error: Unknown operation';
  }
};

// Example usage
console.log(calculator(10, 3, 'add'));      // Output: 13
console.log(calculator(10, 3, 'subtract')); // Output: 7
console.log(calculator(10, 3, 'multiply')); // Output: 30
console.log(calculator(10, 3, 'divide'));   // Output: 3.333...
console.log(calculator(10, 3, 'modulo'));   // Output: 1
console.log(calculator(10, 0, 'divide'));   // Output: Error: Division by zero
```

### Explanation

1. **`demonstrateModulo` Function**: This function takes two parameters, `a` and `b`, and returns the result of `a % b`, demonstrating the modulo operation.

2. **`calculator` Function**: This function takes three parameters: `num1`, `num2`, and `operation`. It performs the specified operation based on the value of `operation` using a switch statement. It supports addition, subtraction, multiplication, division, and modulo.

3. **Example Usage**: The calculator function is called with different operations, and the results are logged to the console. 

You can run this code in any JavaScript environment (like a browser console or Node.js) to see the results.
