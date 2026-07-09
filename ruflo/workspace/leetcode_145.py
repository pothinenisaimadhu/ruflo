# -*- coding: utf-8 -*-
"""
LeetCode 145 – Binary Tree Postorder Traversal
------------------------------------------------
Provides two solutions:
1. Recursive post‑order traversal
2. Iterative post‑order traversal (using a stack)

Both functions accept the root of a binary tree and return a list
containing the node values in post‑order (left → right → node).
"""

from __future__ import annotations
from typing import List, Optional
import unittest


class TreeNode:
    """Binary tree node."""
    __slots__ = ("val", "left", "right")

    def __init__(self, val: int = 0,
                 left: Optional["TreeNode"] = None,
                 right: Optional["TreeNode"] = None):
        self.val = val
        self.left = left
        self.right = right


def postorder_traversal_recursive(root: Optional[TreeNode]) -> List[int]:
    """Recursive post‑order traversal.
    Time  : O(n)
    Space : O(h) – call stack, where h is tree height.
    """
    def dfs(node: Optional[TreeNode], out: List[int]) -> None:
        if not node:
            return
        dfs(node.left, out)
        dfs(node.right, out)
        out.append(node.val)

    result: List[int] = []
    dfs(root, result)
    return result


def postorder_traversal_iterative(root: Optional[TreeNode]) -> List[int]:
    """Iterative post‑order traversal.
    Uses a single stack and a pointer to track the previously visited node.
    Time  : O(n)
    Space : O(n) – explicit stack.
    """
    if not root:
        return []

    stack: List[TreeNode] = []
    result: List[int] = []
    last_visited: Optional[TreeNode] = None
    current: Optional[TreeNode] = root

    while stack or current:
        while current:
            stack.append(current)
            current = current.left

        peek_node = stack[-1]
        if peek_node.right and last_visited != peek_node.right:
            current = peek_node.right
        else:
            result.append(peek_node.val)
            last_visited = stack.pop()

    return result


# ----------------------------------------------------------------------
# Unit tests
# ----------------------------------------------------------------------
class TestPostorderTraversal(unittest.TestCase):
    def build_tree(self, values: List[Optional[int]]) -> Optional[TreeNode]:
        """Helper to build a binary tree from a level‑order list where None
        represents a missing node.
        """
        if not values:
            return None
        nodes = [None if v is None else TreeNode(v) for v in values]
        kid_idx = 1
        for i, node in enumerate(nodes):
            if node is None:
                continue
            if kid_idx < len(nodes):
                node.left = nodes[kid_idx]
                kid_idx += 1
            if kid_idx < len(nodes):
                node.right = nodes[kid_idx]
                kid_idx += 1
        return nodes[0]

    def test_empty(self):
        self.assertEqual(postorder_traversal_recursive(None), [])
        self.assertEqual(postorder_traversal_iterative(None), [])

    def test_single_node(self):
        root = TreeNode(1)
        self.assertEqual(postorder_traversal_recursive(root), [1])
        self.assertEqual(postorder_traversal_iterative(root), [1])

    def test_example(self):
        # Tree:   1
        #          \
        #           2
        #          /
        #         3
        root = TreeNode(1, None, TreeNode(2, TreeNode(3), None))
        expected = [3, 2, 1]
        self.assertEqual(postorder_traversal_recursive(root), expected)
        self.assertEqual(postorder_traversal_iterative(root), expected)

    def test_balanced(self):
        # Level‑order: [1,2,3,4,5,6,7]
        root = self.build_tree([1, 2, 3, 4, 5, 6, 7])
        expected = [4, 5, 2, 6, 7, 3, 1]
        self.assertEqual(postorder_traversal_recursive(root), expected)
        self.assertEqual(postorder_traversal_iterative(root), expected)

    def test_left_heavy(self):
        # Tree: 1 -> 2 -> 3 -> 4 (all left children)
        root = TreeNode(1, TreeNode(2, TreeNode(3, TreeNode(4), None), None), None)
        expected = [4, 3, 2, 1]
        self.assertEqual(postorder_traversal_recursive(root), expected)
        self.assertEqual(postorder_traversal_iterative(root), expected)


if __name__ == "__main__":
    unittest.main()
